import unittest
class MyTestCase(unittest.TestCase):
    def test_func1(self):
        self.x = 2
    def test_func2(self):
        assert not hasattr(self, 'x')
