# Extracted from pytest 9.2.0, commit ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# Source: https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/python/fixtures.py#L3647
# Copyright (c) 2004 Holger Krekel and others. MIT; see ../../licenses/pytest.txt.

import pytest
@pytest.fixture
def test_app():
    return 1

def test_something(test_app):
    assert test_app == 1
