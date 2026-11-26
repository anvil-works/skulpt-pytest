import unittest

class MyTestCase(unittest.TestCase):
    def test_one(self):
        raise unittest.SkipTest('skipping due to reasons')
