# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_skipping.py#L914
# Unchanged embedded Python source; outer pytester harness excluded.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest
@pytest.mark.skip
def test_foo():
    pass
@pytest.mark.skip(reason="nothing in particular")
def test_bar():
    pass
def test_baz():
    assert True
