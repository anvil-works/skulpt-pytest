"""Approximate comparisons for scalars and flat sequences/mappings."""
import math


class _Approx:
    def __init__(self, expected, rel, abs, nan_ok):
        self.expected = expected
        self.absolute = 1e-12 if abs is None else abs
        self.relative = (1e-6 if abs is None else 0) if rel is None else rel
        self.nan_ok = nan_ok
        for tolerance in (self.absolute, self.relative):
            if tolerance < 0 or math.isnan(tolerance):
                raise ValueError('tolerance must be nonnegative and not NaN: %r' % tolerance)
        container = isinstance(expected, (dict, list, tuple))
        if not container and expected is not None and not isinstance(expected, (int, float, str)):
            raise TypeError('approx supports numbers and flat lists, tuples or dictionaries')
        values = expected.values() if isinstance(expected, dict) else expected if container else ()
        if any(isinstance(value, (dict, list, tuple, set, frozenset)) for value in values):
            raise TypeError('nested approximate comparisons are not supported')

    def _equal(self, actual, expected):
        if isinstance(actual, bool) or isinstance(expected, bool):
            return actual is expected
        if actual == expected:
            return True
        if not isinstance(actual, (int, float)) or not isinstance(expected, (int, float)):
            return False
        if math.isnan(expected):
            return self.nan_ok and math.isnan(actual)
        if math.isinf(expected):
            return False
        return abs(actual - expected) <= max(self.absolute, self.relative * abs(expected))

    def __eq__(self, actual):
        if isinstance(self.expected, dict):
            return isinstance(actual, dict) and actual.keys() == self.expected.keys() and all(
                self._equal(actual[name], value) for name, value in self.expected.items())
        if isinstance(self.expected, (list, tuple)):
            return isinstance(actual, (list, tuple)) and len(actual) == len(self.expected) and all(
                self._equal(left, right) for left, right in zip(actual, self.expected))
        return self._equal(actual, self.expected)

    def __ne__(self, actual):
        return not self == actual

    def __repr__(self):
        return 'approx(%r)' % (self.expected,)

    def __bool__(self):
        raise AssertionError('approx() is not supported in a boolean context; compare a value to it')


def approx(expected, rel=None, abs=None, nan_ok=False):
    return _Approx(expected, rel, abs, nan_ok)
