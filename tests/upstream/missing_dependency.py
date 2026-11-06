# Extracted from pytest 9.2.0, commit ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# Source: https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/fixtures.py#L1620
# Copyright (c) 2004 Holger Krekel and others. MIT; see ../../licenses/pytest.txt.

import pytest

@pytest.fixture()
def fail(missing):
    return

@pytest.fixture()
def call_fail(fail):
    return

def test_missing(call_fail):
    pass
