# Extracted from pytest 9.2.0, commit ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# Source: https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/fixtures.py#L4202
# Copyright (c) 2004 Holger Krekel and others. MIT; see ../../licenses/pytest.txt.

import pytest
@pytest.fixture
def arg1():
    print("setup")
    yield 1
    print("teardown")
def test_1(arg1):
    print("test1", arg1)
def test_2(arg1):
    print("test2", arg1)
    assert 0
