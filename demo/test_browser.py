import pytest
import unittest


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


class BrowserCase(unittest.TestCase):
    __test__ = False

    def test_suspension(self):
        self.assertEqual(self.value, 41)
        pause()
        print('resumed unittest method')


class TestBrowserCase(BrowserCase):
    __test__ = True

    def setUp(self):
        self.value = 41

    def tearDown(self):
        print('unittest teardown')
