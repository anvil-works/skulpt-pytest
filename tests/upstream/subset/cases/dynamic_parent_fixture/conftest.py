# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/fixtures.py#L890
# Unchanged embedded Python source; outer pytester harness excluded.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest

@pytest.fixture
def something(request):
    return 1
