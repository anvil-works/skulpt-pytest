import sys
import pytest

@pytest.fixture
def captured_print(capsys):
    print('stdout contents begin')
    print('stderr contents begin', file=sys.stderr)
    out, err = capsys.readouterr()

    yield out, err

    print('stdout contents end')
    print('stderr contents end', file=sys.stderr)
    out, err = capsys.readouterr()
    assert out == 'stdout contents end\n'
    assert err == 'stderr contents end\n'

def test_captured_print(captured_print):
    out, err = captured_print
    assert out == 'stdout contents begin\n'
    assert err == 'stderr contents begin\n'
