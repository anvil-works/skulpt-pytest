# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py
# Original test bodies; public import prelude and removal of unused self only.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest
from pytest import approx
from operator import eq, ne
from math import inf, nan


# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L509
def test_reasonable_defaults():
    # Whatever the defaults are, they should work for numbers close to 1
    # than have a small amount of floating-point error.
    assert 0.1 + 0.2 == approx(0.3)

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L514
def test_default_tolerances():
    # This tests the defaults as they are currently set.  If you change the
    # defaults, this test will fail but you should feel free to change it.
    # None of the other tests (except the doctests) should be affected by
    # the choice of defaults.
    examples = [
        # Relative tolerance used.
        (eq, 1e100 + 1e94, 1e100),
        (ne, 1e100 + 2e94, 1e100),
        (eq, 1e0 + 1e-6, 1e0),
        (ne, 1e0 + 2e-6, 1e0),
        # Absolute tolerance used.
        (eq, 1e-100, +1e-106),
        (eq, 1e-100, +2e-106),
        (eq, 1e-100, 0),
    ]
    for op, a, x in examples:
        assert op(a, approx(x))

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L549
def test_relative_tolerance():
    within_1e8_rel = [(1e8 + 1e0, 1e8), (1e0 + 1e-8, 1e0), (1e-8 + 1e-16, 1e-8)]
    for a, x in within_1e8_rel:
        assert a == approx(x, rel=5e-8, abs=0.0)
        assert a != approx(x, rel=5e-9, abs=0.0)

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L555
def test_absolute_tolerance():
    within_1e8_abs = [(1e8 + 9e-9, 1e8), (1e0 + 9e-9, 1e0), (1e-8 + 9e-9, 1e-8)]
    for a, x in within_1e8_abs:
        assert a == approx(x, rel=0, abs=5e-8)
        assert a != approx(x, rel=0, abs=5e-9)

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L677
def test_list():
    actual = [1 + 1e-7, 2 + 1e-8]
    expected = [1, 2]

    # Return false if any element is outside the tolerance.
    assert actual == approx(expected, rel=5e-7, abs=0)
    assert actual != approx(expected, rel=5e-8, abs=0)
    assert approx(expected, rel=5e-7, abs=0) == actual
    assert approx(expected, rel=5e-8, abs=0) != actual

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L693
def test_list_wrong_len():
    assert [1, 2] != approx([1])
    assert [1, 2] != approx([1, 2, 3])

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L714
def test_dict():
    actual = {"a": 1 + 1e-7, "b": 2 + 1e-8}
    # Dictionaries became ordered in python3.6, so switch up the order here
    # to make sure it doesn't matter.
    expected = {"b": 2, "a": 1}

    # Return false if any element is outside the tolerance.
    assert actual == approx(expected, rel=5e-7, abs=0)
    assert actual != approx(expected, rel=5e-8, abs=0)
    assert approx(expected, rel=5e-7, abs=0) == actual
    assert approx(expected, rel=5e-8, abs=0) != actual

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L734
def test_dict_wrong_len():
    assert {"a": 1, "b": 2} != approx({"a": 1})
    assert {"a": 1, "b": 2} != approx({"a": 1, "c": 2})
    assert {"a": 1, "b": 2} != approx({"a": 1, "b": 2, "c": 3})

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L477
def test_negative_tolerance_message():
    # Error message for negative tolerance should include the value.
    with pytest.raises(ValueError, match="-3"):
        0 == approx(1, abs=-3)
    with pytest.raises(ValueError, match="-3"):
        0 == approx(1, rel=-3)

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L390
def test_bool():
    with pytest.raises(AssertionError) as err:
        assert approx(1)

    assert err.match(r"approx\(\) is not supported in a boolean context")

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L576
def test_expecting_inf():
    examples = [
        (eq, inf, inf),
        (eq, -inf, -inf),
        (ne, inf, -inf),
        (ne, 0.0, inf),
        (ne, nan, inf),
    ]
    for op, a, x in examples:
        assert op(a, approx(x))

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/approx.py#L587
def test_expecting_nan():
    examples = [
        (eq, nan, nan),
        (eq, -nan, -nan),
        (eq, nan, -nan),
        (ne, 0.0, nan),
        (ne, inf, nan),
    ]
    for op, a, x in examples:
        # Nothing is equal to NaN by default.
        assert a != approx(x)

        # If ``nan_ok=True``, then NaN is equal to NaN.
        assert op(a, approx(x, nan_ok=True))
