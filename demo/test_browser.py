import pytest


@pytest.fixture
def resource():
    try:
        yield 41
    finally:
        print('browser fixture cleaned up')


def test_passing(resource):
    pause()
    with pytest.raises(ValueError):
        int('not an integer')
    assert resource == 41


def test_failing(resource):
    pause()
    assert resource == 42
