import unittest
import pytest
class MyTestCase(unittest.TestCase):
    x = 0
    @classmethod
    def setUpClass(cls):
        cls.x += 1
    def test_func1(self):
        assert self.x == 1
    def test_func2(self):
        assert self.x == 1
    @classmethod
    def tearDownClass(cls):
        cls.x -= 1
def test_torn_down():
    assert MyTestCase.x == 0
