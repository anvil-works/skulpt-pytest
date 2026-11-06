# Extracted from pytest 9.2.0, commit ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# Source: https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py
# Copyright (c) 2004 Holger Krekel and others. MIT; see ../../licenses/pytest.txt.

import re
import pytest

def wrap_escape(s: str) -> str:
    return "^" + re.escape(s) + "$"

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py#L23
def test_raises():
    with pytest.raises(ValueError) as excinfo:
        int("qwe")
    assert "invalid literal" in str(excinfo.value)

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py#L219
def test_tuple():
    with pytest.raises((KeyError, ValueError)):
        raise KeyError("oops")

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py#L209
def test_noclass() -> None:
    with pytest.raises(TypeError):
        with pytest.raises("wrong"):  # type: ignore[call-overload]
            ...  # pragma: no cover

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py#L214
def test_invalid_arguments_to_raises() -> None:
    with pytest.raises(TypeError, match="unknown"):
        with pytest.raises(TypeError, unknown="bogus"):  # type: ignore[call-overload]
            raise ValueError()

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py#L223
def test_no_raise_message() -> None:
    try:
        with pytest.raises(ValueError):
            int("0")
    except pytest.fail.Exception as e:
        assert e.msg == "DID NOT RAISE ValueError"
    else:
        assert False, "Expected pytest.raises.Exception"

    try:
        with pytest.raises(ValueError):
            pass
    except pytest.fail.Exception as e:
        assert e.msg == "DID NOT RAISE ValueError"
    else:
        assert False, "Expected pytest.raises.Exception"

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py#L341
def test_raises_match_wrong_type():
    """Raising an exception with the wrong type and match= given.

    pytest should throw the unexpected exception - the pattern match is not
    really relevant if we got a different exception.
    """
    with pytest.raises(
        ValueError,
        match=wrap_escape("invalid literal for int() with base 10: 'asdf'"),
    ):
        with pytest.raises(IndexError, match="nomatch"):
            int("asdf")

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py#L94 (embedded module)
def test_noraise():
    with pytest.raises(pytest.raises.Exception):
        with pytest.raises(ValueError):
               int()

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/raises.py#L94 (embedded module)
def test_raise_wrong_exception_passes_by():
    with pytest.raises(ZeroDivisionError):
        with pytest.raises(ValueError):
               1/0
