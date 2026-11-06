# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/metafunc.py#L2502
# Derived suite: see manifest.json for adaptations.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest

@pytest.mark.parametrize(
    "bar",
    ["x", "y"],
)
@pytest.mark.parametrize(
    "foo",
    ["a", "b"],
    ids=["a", "b"],
)
def test_func(foo, bar):
    pass
