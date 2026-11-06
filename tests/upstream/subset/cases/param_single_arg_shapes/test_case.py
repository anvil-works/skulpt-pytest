# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/metafunc.py#L1408
# Unchanged embedded Python source; outer pytester harness excluded.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest

scenarios = [('a',), ('b',)]

@pytest.mark.parametrize(("arg",), scenarios)
def test_tuple_form(arg):
    # Tuple argnames: values are unpacked from tuples
    assert arg in ('a', 'b')
    assert isinstance(arg, str)

@pytest.mark.parametrize("arg,", scenarios)
def test_string_trailing_comma(arg):
    # String with trailing comma: should behave like tuple form
    assert arg in ('a', 'b')
    assert isinstance(arg, str)

@pytest.mark.parametrize("arg", scenarios)
def test_string_no_comma(arg):
    # String without comma: tuples are passed as-is
    assert arg in (('a',), ('b',))
    assert isinstance(arg, tuple)
