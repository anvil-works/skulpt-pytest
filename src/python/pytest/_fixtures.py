"""Scoped fixture values and cleanup for one run in the host's Python environment."""
from . import Failed, MonkeyPatch, _Fixture

_missing = object()
_scope_order = {'function': 0, 'module': 1, 'session': 2}


class FixtureLookupError(Exception):
    pass


class ScopeMismatch(Exception):
    pass


def _arguments(function):
    code = function.__code__
    if code.co_posonlyargcount or code.co_kwonlyargcount:
        raise NotImplementedError('positional-only and keyword-only fixture arguments are not yet supported')
    return code.co_varnames[:code.co_argcount - len(function.__defaults__ or ())]


class _Scope:
    def __init__(self):
        self.cache = {}
        self.finalizers = []
        self.closed = False

    def close(self):
        errors = []
        while self.finalizers:
            try:
                finalizer = self.finalizers.pop()
                if isinstance(finalizer, _Entry):
                    errors.extend(finalizer.close())
                else:
                    finalizer()
            except BaseException as error:
                errors.append(error)
        self.cache.clear()
        self.closed = True
        return errors


class _Entry:
    def __init__(self, definition, store, parameter):
        self.definition, self.store, self.parameter = definition, store, parameter
        self.state, self.value, self.error, self.traceback = 'setting_up', None, None, None
        self.finalizers = []

    def close(self):
        errors = []
        while self.finalizers:
            try:
                self.finalizers.pop()()
            except BaseException as error:
                errors.append(error)
        self.store.cache.pop(self.definition, None)
        self.state = 'finished'
        return errors


class _Request:
    def __init__(self, context, entry, chain):
        self._session, self._entry, self._chain = context.session, entry, tuple(chain)
        self._store = entry.store if entry else context.scope
        self._context = context

    @property
    def scope(self):
        return self._entry.definition.scope if self._entry else 'function'

    @property
    def fixturename(self):
        return self._entry.definition.name if self._entry else None

    @property
    def param(self):
        if self._entry is None or self._entry.parameter is _missing:
            raise AttributeError('request has no parameter')
        return self._entry.parameter

    def addfinalizer(self, finalizer):
        if not callable(finalizer):
            raise TypeError('finalizer must be callable')
        context = self._session.current
        if context is None or self._store.closed:
            raise RuntimeError('fixture request is no longer active')
        (self._entry.finalizers if self._entry else self._store.finalizers).append(finalizer)

    def getfixturevalue(self, name):
        context = self._session.current
        if context is None or self._store.closed:
            raise RuntimeError('fixture request is no longer active')
        return self._context.resolve(name, self._chain)


def _finish_yield(generator, name):
    try:
        next(generator)
    except StopIteration:
        return
    try:
        raise Failed("fixture '%s' has more than one yield" % name)
    finally:
        generator.close()


def _monkeypatch(request):
    patch = MonkeyPatch()
    request.addfinalizer(patch.undo)
    return patch


_builtin_monkeypatch = _Fixture(_monkeypatch, 'monkeypatch', False)


class FixtureSession:
    def __init__(self):
        self.scope = _Scope()
        self.modules = {}
        self.current = None

    def context(self, case):
        context = FixtureContext(self, case)
        self.current = context
        return context

    def module(self, path):
        if path not in self.modules:
            self.modules[path] = _Scope()
        return self.modules[path]

    def finish(self, context, close_module, close_session):
        context.phase = 'teardown'
        errors = context.scope.close()
        if close_module:
            module = self.modules.pop(context.case.path, None)
            if module is not None:
                errors.extend(module.close())
        if close_session:
            errors.extend(self.scope.close())
        self.current = None if close_session else context
        return errors

    def close(self):
        errors = []
        if self.current is not None:
            self.current.phase = 'teardown'
            errors.extend(self.current.scope.close())
        for scope in reversed(list(self.modules.values())):
            errors.extend(scope.close())
        self.modules.clear()
        errors.extend(self.scope.close())
        self.current = None
        return errors


class FixtureContext:
    def __init__(self, session, case):
        self.session, self.case = session, case
        self.scope, self.resolving, self.phase = _Scope(), [], 'setup'

    def arguments(self, function):
        return {name: self.resolve(name) for name in _arguments(function)}

    def resolve(self, name, chain=None):
        chain = [entry for entry in (self.resolving if chain is None else chain) if entry.state != 'finished']
        caller = chain[-1] if chain else None
        if name == 'request':
            return _Request(self, caller, chain)
        if name in self.case.direct:
            if caller and caller.definition.scope != 'function':
                raise ScopeMismatch('a broader-scoped fixture cannot depend on a function parameter')
            return self.case.direct[name]
        definitions = self.case.definitions.get(name)
        if not definitions:
            raise FixtureLookupError("fixture '%s' not found" % name)
        # A same-name request from an override resolves its next outer definition.
        depth = sum(entry.definition.name == name for entry in chain)
        if depth >= len(definitions):
            raise FixtureLookupError('recursive fixture dependency: ' + ' -> '.join(
                [entry.definition.name for entry in chain] + [name]))
        definition = definitions[-1 - depth]
        if caller and _scope_order[caller.definition.scope] > _scope_order[definition.scope]:
            raise ScopeMismatch("%s fixture '%s' cannot access %s fixture '%s'" % (
                caller.definition.scope, caller.definition.name, definition.scope, name))
        parameter = self.case.indirect.get(name, self.case.fixture_params.get(definition, _missing))
        if definition.params is not None and parameter is _missing:
            raise FixtureLookupError("fixture '%s' has no parameter for this test; request it in the test arguments" % name)
        if parameter is not _missing and definition.scope != 'function':
            raise NotImplementedError('parametrized fixtures currently require function scope')
        if definition.scope == 'function':
            store = self.scope
        elif definition.scope == 'session':
            store = self.session.scope
        else:
            store = self.session.module(self.case.path)
        entry = store.cache.get(definition)
        if entry is not None:
            if entry.state == 'error':
                raise entry.error.with_traceback(entry.traceback)
            if entry.state != 'ready':
                raise FixtureLookupError('recursive fixture dependency: ' + name)
            return entry.value
        if self.session.current.phase == 'teardown':
            raise AssertionError("fixture '%s' is no longer available during teardown" % name)
        entry = _Entry(definition, store, _missing if parameter is _missing else parameter[1])
        store.cache[definition] = entry
        previous = self.resolving
        self.resolving = chain + [entry]
        try:
            arguments = self.arguments(definition.function)
            value = definition.function(**arguments)
            if definition.function.__code__.co_flags & 0x20:
                generator = value
                try:
                    value = next(generator)
                except StopIteration:
                    raise ValueError("fixture '%s' did not yield a value" % name)
                entry.finalizers.append(lambda: _finish_yield(generator, name))
            entry.value, entry.state = value, 'ready'
            return value
        except BaseException as error:
            entry.error, entry.traceback, entry.state = error, error.__traceback__, 'error'
            raise
        finally:
            # Dependencies, including dynamic lookups during setup, finish first.
            # Register this entry last so its cleanup precedes theirs.
            store.finalizers.append(entry)
            self.resolving = previous


def _definitions():
    return {'monkeypatch': [_builtin_monkeypatch]}
