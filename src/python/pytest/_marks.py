"""Public marks and parameter rows, without pytest's plugin machinery."""
import types


class _Mark:
    def __init__(self, name, args=(), kwargs=None):
        self.name, self.args, self.kwargs = name, args, kwargs or {}

    def __call__(self, *args, **kwargs):
        if len(args) == 1 and isinstance(args[0], types.FunctionType) and not kwargs:
            function = args[0]
            function._pytest_marks = list(getattr(function, '_pytest_marks', ())) + [self]
            return function
        return _Mark(self.name, self.args + args, dict(self.kwargs, **kwargs))


class _Marks:
    def __getattr__(self, name):
        if name not in ('parametrize', 'skip', 'skipif', 'xfail', 'usefixtures'):
            raise AttributeError("pytest mark '%s' is not supported" % name)
        return _Mark(name)


mark = _Marks()


def _marks(value):
    if isinstance(value, _Mark):
        return [value]
    result = list(value)
    if any(not isinstance(item, _Mark) for item in result):
        raise TypeError('marks must be pytest marks')
    return result


class _ParameterSet:
    def __init__(self, values, marks, id):
        if id is not None and not isinstance(id, str):
            raise TypeError('parameter id must be a string')
        self.values, self.marks, self.id = values, _marks(marks), id


def param(*values, marks=(), id=None):
    return _ParameterSet(values, marks, id)


def _parameter_rows(names, values, ids=None, force_tuple=True):
    values = list(values)
    if ids is not None and not callable(ids):
        ids = list(ids)
        if len(ids) != len(values):
            raise ValueError('ids must have the same length as parameter values')
    rows = []
    for index, value in enumerate(values):
        row = value if isinstance(value, _ParameterSet) else _ParameterSet(
            (value,) if force_tuple else tuple(value), (), None)
        if len(row.values) != len(names):
            raise ValueError('parameter names and values must have the same length')
        id = row.id
        if id is None and ids is not None:
            if callable(ids):
                parts = [ids(value) for value in row.values]
                id = '-'.join(str(part) if part is not None else _value_id(name, value, index)
                              for name, value, part in zip(names, row.values, parts))
            else:
                id = ids[index]
        if id is None:
            id = '-'.join(_value_id(name, value, index) for name, value in zip(names, row.values))
        rows.append((row, str(id)))
    if not rows:
        rows.append((_ParameterSet((None,) * len(names), mark.skip(reason='empty parameter set'), None),
                     '-'.join(name + '0' for name in names)))
    return rows


def _value_id(name, value, index):
    return str(value) if value is None or isinstance(value, (str, int, float, bool)) else name + str(index)
