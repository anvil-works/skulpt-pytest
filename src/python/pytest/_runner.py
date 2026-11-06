"""Collection and function-fixture lifetimes over a host-supplied file manifest."""
import linecache
import sys
import time
import traceback
import types
from _skulpt_pytest import files, targets, emit
from . import Failed, Skipped, _Fixture


class FixtureLookupError(Exception):
    pass


def _arguments(function):
    code = function.__code__
    if code.co_posonlyargcount or code.co_kwonlyargcount:
        raise NotImplementedError('positional-only and keyword-only fixture arguments are not yet supported')
    defaults = function.__defaults__ or ()
    return code.co_varnames[:code.co_argcount - len(defaults)]


class _Fixtures:
    def __init__(self, definitions):
        self.definitions = definitions
        self.values = {}
        self.resolving = []
        self.finalizers = []

    def arguments(self, function):
        return {name: self.resolve(name) for name in _arguments(function)}

    def resolve(self, name):
        if name not in self.definitions:
            raise FixtureLookupError("fixture '%s' not found" % name)
        definitions = self.definitions[name]
        # Requesting the same name from an override resolves the next outer fixture.
        depth = self.resolving.count(name)
        if depth >= len(definitions):
            raise FixtureLookupError('recursive fixture dependency: ' + ' -> '.join(self.resolving + [name]))
        definition = definitions[-1 - depth]
        if definition in self.values:
            return self.values[definition]
        self.resolving.append(name)
        try:
            function = definition.function
            value = function(**self.arguments(function))
            if function.__code__.co_flags & 0x20:
                generator = value
                try:
                    value = next(generator)
                except StopIteration:
                    raise ValueError("fixture '%s' did not yield a value" % name)
                self.finalizers.append((name, generator))
            self.values[definition] = value
            return value
        finally:
            self.resolving.pop()

    def teardown(self):
        errors = []
        for name, generator in reversed(self.finalizers):
            try:
                try:
                    next(generator)
                except StopIteration:
                    continue
                try:
                    raise Failed("fixture '%s' has more than one yield" % name)
                finally:
                    generator.close()
            except BaseException as error:
                errors.append(error)
        # Finish every cleanup before formatting diagnostics, which can itself fail.
        return [_error(error, 'teardown') for error in errors]


def _error(error, phase):
    tb = error.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename.startswith('src/lib/pytest/'):
        tb = tb.tb_next
    summary = traceback.TracebackException(type(error), error, tb)
    return {'phase': phase, 'type': type(error).__name__, 'message': str(summary),
            'traceback': ''.join(summary.format())}


def _run_test(function, definitions):
    started = time.time()
    fixtures = _Fixtures(definitions)
    errors = []
    reason = None
    outcome = 'passed'
    phase = 'setup'
    try:
        for name, layered in definitions.items():
            if any(definition.autouse for definition in layered):
                fixtures.resolve(name)
        arguments = fixtures.arguments(function)
        phase = 'call'
        returned = function(**arguments)
        if isinstance(returned, types.GeneratorType):
            returned.close()
            raise NotImplementedError('generator tests are not supported')
    except Skipped as error:
        outcome, reason = 'skipped', str(error)
    except BaseException as error:
        outcome = 'failed' if phase == 'call' else 'error'
        errors.append(_error(error, phase))
    finally:
        teardown_errors = fixtures.teardown()
        errors.extend(teardown_errors)
        if teardown_errors:
            outcome = 'error'
    result = {'status': 'finished', 'outcome': outcome, 'duration': time.time() - started}
    if errors:
        result['errors'] = errors
    if reason is not None:
        result['reason'] = reason
    return result


def _add_fixtures(definitions, module):
    for value in module.__dict__.values():
        if isinstance(value, _Fixture):
            definitions.setdefault(value.name, []).append(value)


def _selected(test_id, selection):
    return not selection or any(target == '.' or test_id == target or test_id.startswith(target.rstrip('/') + '/')
                               or test_id.startswith(target + '::') for target in selection)


def run(args):
    sources = files()
    selection = targets() if args is None else args
    if any(target.startswith('-') for target in selection):
        raise NotImplementedError('pytest command-line flags are not yet supported')
    modules = {}
    module_names = []
    original_lines = {path: linecache.cache.get(path) for path in sources}
    counts = {'passed': 0, 'failed': 0, 'error': 0, 'skipped': 0}
    emit({'type': 'test_run_update', 'status': 'collecting_tests'})

    def load(path):
        if path not in modules:
            index = len(modules)
            while '_skulpt_pytest_%d' % index in sys.modules:
                index += 1
            name = '_skulpt_pytest_%d' % index
            module = types.ModuleType(name)
            module.__file__, module.__package__ = path, ''
            modules[path] = module
            module_names.append(name)
            sys.modules[name] = module
            source = sources[path]
            linecache.cache[path] = (len(source), None, source.splitlines(True), path)
            exec(compile(source, path, 'exec'), module.__dict__)
        return modules[path]

    try:
        tests = []
        collection_errors = []
        for path in sorted(sources):
            basename = path.rsplit('/', 1)[-1]
            if not path.endswith('.py') or not (basename.startswith('test_') or basename.endswith('_test.py')):
                continue
            try:
                definitions = {}
                parts = path.split('/')[:-1]
                for i in range(len(parts) + 1):
                    conftest = '/'.join(parts[:i] + ['conftest.py'])
                    if conftest in sources:
                        _add_fixtures(definitions, load(conftest))
                module = load(path)
                _add_fixtures(definitions, module)
                for name, function in module.__dict__.items():
                    if name.startswith('Test') and isinstance(function, type):
                        raise NotImplementedError('test classes are not yet supported')
                    if name.startswith('test_') and isinstance(function, types.FunctionType):
                        tests.append((path + '::' + name, path, name, function, definitions))
            except BaseException as error:
                item = _error(error, 'setup')
                item.pop('phase')
                item['file_path'] = path
                collection_errors.append(item)
        emit({'type': 'discovered_tests', 'tests': [
            {'test_id': test_id, 'file_path': path, 'line': function.__code__.co_firstlineno, 'name': name}
            for test_id, path, name, function, definitions in tests]})
        if collection_errors:
            emit({'type': 'test_run_update', 'status': 'complete', 'counts': counts,
                  'exit_code': 'INTERRUPTED', 'collection_errors': collection_errors})
            return 2
        for target in selection:
            known_path = target == '.' or target in sources or any(
                path.startswith(target.rstrip('/') + '/') for path in sources)
            if not any(_selected(test[0], [target]) for test in tests) and not known_path:
                emit({'type': 'test_run_update', 'status': 'complete', 'counts': counts,
                      'exit_code': 'USAGE_ERROR',
                      'error': {'type': 'UsageError', 'message': 'test target not found: ' + target}})
                return 4
        selected = [test for test in tests if _selected(test[0], selection)]
        emit({'type': 'test_run_update', 'status': 'running_tests'})
        for test_id, path, name, function, definitions in selected:
            emit({'type': 'test_updates', 'tests': [{'test_id': test_id, 'result': {'status': 'running'}}]})
            result = _run_test(function, definitions)
            counts[result['outcome']] += 1
            emit({'type': 'test_updates', 'tests': [{'test_id': test_id, 'result': result}]})
        code = 5 if not selected else (1 if counts['failed'] or counts['error'] else 0)
        emit({'type': 'test_run_update', 'status': 'complete', 'counts': counts,
              'exit_code': {0: 'OK', 1: 'TESTS_FAILED', 5: 'NO_TESTS_COLLECTED'}[code]})
        return code
    finally:
        for name in module_names:
            sys.modules.pop(name, None)
        for path, previous in original_lines.items():
            if previous is None:
                linecache.cache.pop(path, None)
            else:
                linecache.cache[path] = previous
