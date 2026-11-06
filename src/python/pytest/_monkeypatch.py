"""Reversible attribute and mapping changes for browser tests."""
from contextlib import contextmanager

_missing = object()


def _target(path):
    if not isinstance(path, str) or '.' not in path:
        raise TypeError('a dotted target must name a module and attribute')
    parts = path.split('.')
    target = __import__(parts[0])
    for index, name in enumerate(parts[1:-1], 1):
        try:
            target = getattr(target, name)
        except AttributeError:
            __import__('.'.join(parts[:index + 1]))
            target = getattr(target, name)
    return target, parts[-1]


def _attribute_value(target, name, value):
    if isinstance(target, type):
        return target.__dict__.get(name, _missing)
    descriptor = next((base.__dict__[name] for base in type(target).__mro__ if name in base.__dict__), None)
    if descriptor is None or not (hasattr(descriptor, '__set__') or hasattr(descriptor, '__delete__')):
        namespace = getattr(target, '__dict__', None)
        if isinstance(namespace, dict):
            return namespace.get(name, _missing)
    return value


class MonkeyPatch:
    def __init__(self):
        self._attributes = []
        self._items = []

    def setattr(self, target, name, value=_missing, raising=True):
        if value is _missing:
            value = name
            target, name = _target(target)
        old = getattr(target, name, _missing)
        if raising and old is _missing:
            raise AttributeError(name)
        old = _attribute_value(target, name, old)
        setattr(target, name, value)
        self._attributes.append((target, name, old))

    def delattr(self, target, name=_missing, raising=True):
        if name is _missing:
            target, name = _target(target)
        if not hasattr(target, name):
            if raising:
                raise AttributeError(name)
            return
        old = target.__dict__.get(name, _missing) if isinstance(target, type) else getattr(target, name)
        delattr(target, name)
        self._attributes.append((target, name, old))

    def setitem(self, mapping, name, value):
        old = mapping.get(name, _missing)
        mapping[name] = value
        self._items.append((mapping, name, old))

    def delitem(self, mapping, name, raising=True):
        if name not in mapping:
            if raising:
                raise KeyError(name)
            return
        old = mapping[name]
        del mapping[name]
        self._items.append((mapping, name, old))

    def undo(self):
        while self._attributes:
            target, name, old = self._attributes.pop()
            if old is _missing:
                delattr(target, name)
            else:
                setattr(target, name, old)
        while self._items:
            mapping, name, old = self._items.pop()
            if old is _missing:
                mapping.pop(name, None)
            else:
                mapping[name] = old

    @classmethod
    @contextmanager
    def context(cls):
        patch = cls()
        try:
            yield patch
        finally:
            patch.undo()

    def setenv(self, *args, **kwargs):
        raise NotImplementedError('environment patching is not supported in the browser')

    delenv = setenv

    def chdir(self, *args, **kwargs):
        raise NotImplementedError('filesystem changes are not supported in the browser')

    syspath_prepend = chdir
