"""Collect manifest tests and run public pytest cases in the host Python environment."""
import linecache
import sys
import time
import traceback
import types
from _skulpt_pytest import files, targets, emit
from . import Failed, Skipped, XFailed, _Fixture
from ._fixtures import FixtureSession, _arguments, _definitions
from ._marks import _marks, _parameter_rows


class _Case:
    def __init__(self, path, name, function, definitions, marks, module_marks=()):
        self.path, self.base_name, self.function = path, name, function
        self.definitions, self._marks, self.module_marks = definitions, marks, list(module_marks)
        self.direct, self.indirect, self.fixture_params, self.ids = {}, {}, {}, []
        self.id = None

    def copy(self):
        case = _Case(self.path, self.base_name, self.function, self.definitions, list(self._marks), self.module_marks)
        case.direct, case.indirect = dict(self.direct), dict(self.indirect)
        case.fixture_params, case.ids = dict(self.fixture_params), list(self.ids)
        return case

    @property
    def marks(self):
        # Function/row marks belong to the item and precede module defaults.
        return self._marks + self.module_marks

    def add_marks(self, marks):
        self._marks.extend(marks)

    @property
    def name(self):
        return self.base_name + ('[' + self.id + ']' if self.id is not None else '')

    @property
    def test_id(self):
        return self.path + '::' + self.name


def _closure(case):
    ordered, seen = [], set()

    def visit(name, chain):
        if name == 'request' or name in case.direct:
            return
        definitions = case.definitions.get(name, ())
        depth = chain.count(name)
        if depth >= len(definitions):
            return  # Missing fixtures/cycles are setup errors, not collection errors.
        definition = definitions[-1 - depth]
        if definition in seen:
            return
        seen.add(definition)
        for dependency in _arguments(definition.function):
            visit(dependency, chain + [name])
        ordered.append(definition)

    names = list(_arguments(case.function))
    names.extend(name for name, layered in case.definitions.items() if any(item.autouse for item in layered))
    for marker in case.marks:
        if marker.name == 'usefixtures':
            names.extend(marker.args)
    for name in names:
        visit(name, [])
    return ordered


def _cases(path, name, function, definitions, module_marks):
    function_marks = list(getattr(function, '_pytest_marks', ()))
    markers = function_marks + module_marks
    initial = _Case(path, name, function, definitions, function_marks, module_marks)
    available = set(_arguments(function))
    for definition in _closure(initial):
        available.update(_arguments(definition.function))
    for marker in markers:
        if marker.name == 'usefixtures':
            available.update(marker.args)
    cases = [initial]
    for marker in markers:
        if marker.name != 'parametrize':
            continue
        if len(marker.args) != 2 or set(marker.kwargs) - {'ids', 'indirect', 'scope'}:
            raise TypeError('parametrize requires argument names and values; supported options are ids and indirect')
        if marker.kwargs.get('scope', 'function') != 'function':
            raise NotImplementedError('parametrization currently requires function scope')
        names = marker.args[0]
        force_tuple = isinstance(names, str) and ',' not in names
        names = [part.strip() for part in names.split(',') if part.strip()] if isinstance(names, str) else list(names)
        if not names or any(not isinstance(part, str) or not part for part in names) or len(set(names)) != len(names):
            raise ValueError('parameter names must be nonempty and unique')
        if any(part not in available for part in names):
            raise ValueError('parameter name is not used by the test or its fixtures')
        indirect = marker.kwargs.get('indirect', False)
        indirect = set(names) if indirect is True else set() if indirect is False else set(indirect)
        if indirect - set(names):
            raise ValueError('indirect names must appear in parameter names')
        rows = _parameter_rows(names, marker.args[1], marker.kwargs.get('ids'), force_tuple)
        expanded = []
        for case in cases:
            if set(names) & (set(case.direct) | set(case.indirect)):
                raise ValueError('duplicate parametrization of an argument')
            for row, id in rows:
                new = case.copy()
                for argument, value in zip(names, row.values):
                    (new.indirect if argument in indirect else new.direct)[argument] = value
                new.ids.append(id)
                new.add_marks(row.marks)
                expanded.append(new)
        cases = expanded
    expanded = []
    for case in cases:
        fixture_cases = [case]
        for definition in _closure(case):
            if definition.params is None or definition.name in case.indirect:
                continue
            rows = _parameter_rows([definition.name], definition.params, definition.ids)
            next_cases = []
            for current in fixture_cases:
                for row, id in rows:
                    new = current.copy()
                    new.fixture_params[definition] = row.values[0]
                    new.ids.append(id)
                    new.add_marks(row.marks)
                    next_cases.append(new)
            fixture_cases = next_cases
        expanded.extend(fixture_cases)
    raw_ids = ['-'.join(case.ids) if case.ids else None for case in expanded]
    used, counters = set(), {}
    for case, raw in zip(expanded, raw_ids):
        if raw is None:
            continue
        id = raw
        if raw_ids.count(raw) > 1:
            index = counters.get(raw, 0)
            while True:
                id = raw + ('_' if raw[-1:].isdigit() else '') + str(index)
                index += 1
                if id not in raw_ids and id not in used:
                    break
            counters[raw] = index
        used.add(id)
        case.id = id
    return expanded


def _error(error, phase):
    tb = error.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename.startswith('src/lib/pytest/'):
        tb = tb.tb_next
    summary = traceback.TracebackException(type(error), error, tb)
    return {'phase': phase, 'type': type(error).__name__, 'message': str(summary),
            'traceback': ''.join(summary.format())}


def _condition(marker):
    conditions = marker.args or ((marker.kwargs['condition'],) if 'condition' in marker.kwargs else ())
    if not conditions:
        return marker.name == 'xfail'
    if any(isinstance(condition, str) for condition in conditions):
        raise NotImplementedError('string conditions are not supported; use a boolean expression')
    if marker.kwargs.get('reason') is None:
        raise Failed(marker.name + ' with a boolean condition requires reason=STRING')
    return any(conditions)


def _expectation(markers):
    for marker in markers:
        if marker.name == 'skip':
            return ('skip', marker.kwargs.get('reason', marker.args[0] if marker.args else 'unconditional skip'))
        if marker.name == 'skipif' and _condition(marker):
            return ('skip', marker.kwargs['reason'])
    for marker in markers:
        if marker.name == 'xfail' and _condition(marker):
            if set(marker.kwargs) - {'condition', 'reason', 'strict', 'run', 'raises'}:
                raise TypeError('unsupported xfail option')
            expected = marker.kwargs.get('raises')
            if expected is not None:
                classes = expected if isinstance(expected, tuple) else (expected,)
                if not classes or any(not isinstance(cls, type) or not issubclass(cls, BaseException) for cls in classes):
                    raise TypeError('xfail raises must contain exception types')
            return ('xfail', marker.kwargs)
    return None


def _run_test(case, session, close_module, close_session):
    started = time.time()
    context = session.context(case)
    raw_errors, called, expectation = [], False, None
    try:
        expectation = _expectation(case.marks)
        if expectation and expectation[0] == 'skip':
            raise Skipped(expectation[1])
        if expectation and not expectation[1].get('run', True):
            raise XFailed('[NOTRUN] ' + expectation[1].get('reason', ''))
        for name, layered in case.definitions.items():
            if any(definition.autouse for definition in layered):
                context.resolve(name)
        for marker in case.marks:
            if marker.name == 'usefixtures':
                for name in marker.args:
                    context.resolve(name)
        arguments = context.arguments(case.function)
        context.phase = 'call'
        returned = case.function(**arguments)
        if isinstance(returned, types.GeneratorType):
            returned.close()
            raise NotImplementedError('generator tests are not supported')
        called = True
    except BaseException as error:
        raw_errors.append((context.phase, error))
    finally:
        raw_errors.extend(('teardown', error) for error in session.finish(context, close_module, close_session))
    errors, expected_errors, reason, skipped = [], [], None, False
    options = expectation[1] if expectation and expectation[0] == 'xfail' else None
    for phase, error in raw_errors:
        if isinstance(error, Skipped):
            skipped, reason = True, str(error)
        elif isinstance(error, XFailed):
            expected_errors.append((phase, error))
            reason = str(error)
        elif options is not None and (options.get('raises') is None or isinstance(error, options['raises'])):
            expected_errors.append((phase, error))
            reason = options.get('reason', '')
        else:
            errors.append(_error(error, phase))
    if called and options is not None and options.get('strict', False):
        # A strict successful call is a failure even if teardown separately xfails.
        reason = options.get('reason', '')
        errors.append(_error(Failed('[XPASS(strict)] ' + reason), 'call'))
    if errors:
        outcome = 'error' if any(error['phase'] != 'call' for error in errors) else 'failed'
    elif expected_errors:
        outcome = 'xfailed'
    elif skipped:
        outcome = 'skipped'
    elif called and options is not None:
        reason = options.get('reason', '')
        outcome = 'xpassed'
    else:
        outcome = 'passed'
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


def _selected(case, selection):
    return not selection or any(target == '.' or case.test_id == target or case.path == target
                               or case.path.startswith(target.rstrip('/') + '/')
                               or case.path + '::' + case.base_name == target for target in selection)


def run(args):
    sources = files()
    selection = targets() if args is None else args
    if any(target.startswith('-') for target in selection):
        raise NotImplementedError('pytest command-line flags are not yet supported')
    modules, module_names, load_errors = {}, [], {}
    original_lines = {path: linecache.cache.get(path) for path in sources}
    counts = dict.fromkeys(('passed', 'failed', 'error', 'skipped', 'xfailed', 'xpassed'), 0)
    session = FixtureSession()
    emit({'type': 'test_run_update', 'status': 'collecting_tests'})

    def load(path):
        if path in load_errors:
            raise load_errors[path]
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
            try:
                exec(compile(source, path, 'exec'), module.__dict__)
            except BaseException as error:
                # A later sibling must not use a half-loaded conftest/module.
                load_errors[path] = error
                raise
        return modules[path]

    try:
        tests, collection_errors, collection_skips, skipped_files = [], [], {}, set()
        for path in sorted(sources):
            basename = path.rsplit('/', 1)[-1]
            if not path.endswith('.py') or not (basename.startswith('test_') or basename.endswith('_test.py')):
                continue
            try:
                source_path = path
                definitions = _definitions()
                parts = path.split('/')[:-1]
                for index in range(len(parts) + 1):
                    conftest = '/'.join(parts[:index] + ['conftest.py'])
                    if conftest in sources:
                        source_path = conftest
                        _add_fixtures(definitions, load(conftest))
                source_path = path
                module = load(path)
                _add_fixtures(definitions, module)
                module_marks = _marks(getattr(module, 'pytestmark', ()))
                for name, function in module.__dict__.items():
                    if name.startswith('Test') and isinstance(function, type):
                        raise NotImplementedError('test classes are not yet supported')
                    if name.startswith('test_') and isinstance(function, types.FunctionType):
                        tests.extend(_cases(path, name, function, definitions, module_marks))
            except BaseException as error:
                if isinstance(error, Skipped):
                    if error.allow_module_level or source_path.rsplit('/', 1)[-1] == 'conftest.py':
                        collection_skips[source_path] = {'file_path': source_path, 'reason': str(error)}
                        skipped_files.add(path)
                        continue
                    error = Failed('Using pytest.skip outside a test requires allow_module_level=True. '
                                   + str(error)).with_traceback(error.__traceback__)
                item = _error(error, 'setup')
                item.pop('phase')
                item['file_path'] = path
                collection_errors.append(item)
        emit({'type': 'discovered_tests', 'tests': [
            {'test_id': case.test_id, 'file_path': case.path, 'line': case.function.__code__.co_firstlineno, 'name': case.name}
            for case in tests]})
        counts['skipped'] += len(collection_skips)
        complete = {'type': 'test_run_update', 'status': 'complete', 'counts': counts}
        if collection_skips:
            complete['collection_skips'] = list(collection_skips.values())
        if collection_errors:
            emit(dict(complete, exit_code='INTERRUPTED', collection_errors=collection_errors))
            return 2
        for target in selection:
            known_path = target == '.' or target in sources or any(
                path.startswith(target.rstrip('/') + '/') for path in sources)
            known_path = known_path or any(target.startswith(path + '::') for path in skipped_files)
            if not any(_selected(case, [target]) for case in tests) and not known_path:
                emit(dict(complete, exit_code='USAGE_ERROR',
                          error={'type': 'UsageError', 'message': 'test target not found: ' + target}))
                return 4
        selected = [case for case in tests if _selected(case, selection)]
        emit({'type': 'test_run_update', 'status': 'running_tests'})
        for index, case in enumerate(selected):
            emit({'type': 'test_updates', 'tests': [{'test_id': case.test_id, 'result': {'status': 'running'}}]})
            close_module = index + 1 == len(selected) or selected[index + 1].path != case.path
            result = _run_test(case, session, close_module, index + 1 == len(selected))
            counts[result['outcome']] += 1
            emit({'type': 'test_updates', 'tests': [{'test_id': case.test_id, 'result': result}]})
        code = 5 if not selected else (1 if counts['failed'] or counts['error'] else 0)
        emit(dict(complete, exit_code={0: 'OK', 1: 'TESTS_FAILED', 5: 'NO_TESTS_COLLECTED'}[code]))
        return code
    finally:
        session.close()
        for name in module_names:
            sys.modules.pop(name, None)
        for path, previous in original_lines.items():
            if previous is None:
                linecache.cache.pop(path, None)
            else:
                linecache.cache[path] = previous
