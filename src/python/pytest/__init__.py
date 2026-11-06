"""A deliberately bounded pytest API for Skulpt browser tests."""
import re

__version__ = '0.0.1-dev.0'


class Failed(BaseException):
    def __init__(self, reason):
        super().__init__(reason)
        self.msg = reason


class Skipped(BaseException):
    pass


class XFailed(BaseException):
    pass


def fail(reason=''):
    raise Failed(reason)


def skip(reason=''):
    raise Skipped(reason)


def xfail(reason=''):
    raise XFailed(reason)


fail.Exception = Failed
skip.Exception = Skipped
xfail.Exception = XFailed


class _Fixture:
    def __init__(self, function, name, autouse, scope='function', params=None, ids=None):
        self.function = function
        self.name = name or function.__name__
        self.autouse = autouse
        self.scope, self.params, self.ids = scope, None if params is None else tuple(params), ids
        if self.name == 'request':
            raise ValueError("'request' is a reserved fixture name")

    def __call__(self, *args, **kwargs):
        fail("Fixture '%s' called directly" % self.name)


def fixture(fixture_function=None, *, scope='function', autouse=False, name=None,
            params=None, ids=None):
    if scope not in ('function', 'module', 'session'):
        raise NotImplementedError('only function, module and session fixture scopes are supported')
    if params is not None and scope != 'function':
        raise NotImplementedError('parametrized fixtures currently require function scope')

    def decorate(function):
        return _Fixture(function, name, autouse, scope, params, ids)

    return decorate(fixture_function) if fixture_function is not None else decorate


class ExceptionInfo:
    def __init__(self):
        self.type = None
        self.value = None
        self.traceback = None

    def match(self, pattern):
        text = str(self.value)
        if re.search(pattern, text) is None:
            raise AssertionError('Regex pattern did not match.\nPattern: %r\nInput: %r' % (pattern, text))
        return True


class _Raises:
    def __init__(self, expected_exception, *, match=None):
        exceptions = expected_exception if isinstance(expected_exception, tuple) else (expected_exception,)
        if not exceptions or any(not isinstance(t, type) or not issubclass(t, BaseException) for t in exceptions):
            raise TypeError('expected exception must be a BaseException type or a nonempty tuple of them')
        self.expected = expected_exception
        self.pattern = match
        self.info = ExceptionInfo()

    def __enter__(self):
        return self.info

    def __exit__(self, exc_type, value, tb):
        if exc_type is None:
            name = self.expected.__name__ if isinstance(self.expected, type) else repr(self.expected)
            fail('DID NOT RAISE %s' % name)
        if not issubclass(exc_type, self.expected):
            return False
        self.info.type, self.info.value, self.info.traceback = exc_type, value, tb
        if self.pattern is not None:
            self.info.match(self.pattern)
        return True


def raises(expected_exception, *args, **kwargs):
    if not args:
        return _Raises(expected_exception, **kwargs)
    with _Raises(expected_exception) as info:
        args[0](*args[1:], **kwargs)
    return info


raises.Exception = Failed


def main(args=None):
    from ._runner import run
    return run(args)


from ._marks import mark, param
from ._approx import approx
from ._monkeypatch import MonkeyPatch
