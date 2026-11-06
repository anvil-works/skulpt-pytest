# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/metafunc.py#L2429
# Derived suite: see manifest.json for adaptations.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest

@pytest.mark.parametrize(
    ("foo", "bar"),
    [
        pytest.param("a", "x", id="paramset1"),
        pytest.param("b", "y", id="paramset2"),
        ("c", "z"),
    ],
)
def test_func(foo, bar):
    pass
