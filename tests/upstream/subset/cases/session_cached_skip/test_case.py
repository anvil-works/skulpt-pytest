# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/fixtures.py#L2770
# Unchanged embedded Python source; outer pytester harness excluded.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest
values = []
@pytest.fixture(scope="session")
def fix():
    values.append(1)
    pytest.skip('skipping')

def test_1(fix):
    pass
def test_2(fix):
    pass
def test_last():
    assert values == [1]
