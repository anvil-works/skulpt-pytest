# Extracted from pytest 9.2.0, commit ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# Source: https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/collect.py#L1419
# Copyright (c) 2004 Holger Krekel and others. MIT; see ../../licenses/pytest.txt.

class Oh(object):
    def __call__(self):
        pass

test_a = Oh()

def test_real():
    pass
