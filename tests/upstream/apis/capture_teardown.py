import sys
import pytest

@pytest.fixture()
def fix(capsys):
    print("setup out")
    sys.stderr.write("setup err\n")
    yield
    out, err = capsys.readouterr()
    assert out == 'setup out\ncall out\n'
    assert err == 'setup err\ncall err\n'

def test_a(fix):
    print("call out")
    sys.stderr.write("call err\n")
