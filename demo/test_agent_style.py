import sys
import pytest


@pytest.fixture(scope='module')
def settings():
    return {'mode': 'original', 'cleanups': 0}


@pytest.mark.parametrize('index, value, expected', [(0, 0.1 + 0.2, 0.3), (1, 1 / 3, 0.3333333)])
def test_agent_style(index, value, expected, settings, monkeypatch, request):
    assert settings == {'mode': 'original', 'cleanups': index}
    monkeypatch.setitem(settings, 'mode', 'patched')
    def cleanup():
        settings['cleanups'] += 1
    request.addfinalizer(cleanup)
    pause()
    assert value == pytest.approx(expected)


@pytest.mark.xfail(strict=True, reason='example known failure')
def test_known_failure():
    assert False


def test_capture_and_exception_check(capsys):
    print('captured before suspension')
    pause()
    sys.stderr.write('captured stderr\n')
    with capsys.disabled():
        print('uncaptured browser output')
    assert capsys.readouterr() == ('captured before suspension\n', 'captured stderr\n')
    with pytest.raises(ValueError, match='invalid amount', check=lambda error: error.args == ('invalid amount',)):
        raise ValueError('invalid amount')
