# Extracted from pytest 9.2.0, commit ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# Source: https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/fixtures.py#L539
# Copyright (c) 2004 Holger Krekel and others. MIT; see ../../licenses/pytest.txt.

import pytest

# Adaptation: a scalar parent replaces params/request.param; child body is unchanged.
@pytest.fixture
def foo():
    return 1
