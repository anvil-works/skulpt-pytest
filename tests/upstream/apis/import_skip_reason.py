import pytest
foobarbaz = pytest.importorskip("foobarbaz2", reason="just because")

def test_foo():
    pass
