import unittest
class TC(unittest.TestCase):
    def tearDown(self):
        assert 0, "down1"
    def test_method(self):
        assert False, "down2"
