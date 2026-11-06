# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/fixtures.py#L2870
# Unchanged embedded Python source; outer pytester harness excluded.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest
finalized_list = []
created_list = []
@pytest.fixture(scope="module")
def arg(request):
    created_list.append(1)
    assert request.scope == "module"
    request.addfinalizer(lambda: finalized_list.append(1))
@pytest.fixture
def created(request):
    return len(created_list)
@pytest.fixture
def finalized(request):
    return len(finalized_list)
