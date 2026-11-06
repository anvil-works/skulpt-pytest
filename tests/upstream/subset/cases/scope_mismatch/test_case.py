# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/fixtures.py#L1495
# Unchanged embedded Python source; outer pytester harness excluded.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest
@pytest.fixture(scope="function")
def arg1():
    return 1

@pytest.fixture(scope="module")
def arg2(arg1):
    return arg1 + 1

def test_add(arg2):
    assert arg2 == 2
