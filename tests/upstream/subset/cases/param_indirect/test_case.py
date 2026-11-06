# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/metafunc.py#L948
# Unchanged embedded Python source; outer pytester harness excluded.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest
@pytest.fixture(scope='function')
def x(request):
    return request.param * 3
@pytest.fixture(scope='function')
def y(request):
    return request.param * 2
@pytest.mark.parametrize('x, y', [('a', 'b')], indirect=['x'])
def test_simple(x,y):
    assert len(x) == 3
    assert len(y) == 1
