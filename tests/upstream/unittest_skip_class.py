import unittest

@unittest.skip("hello")
class MyTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(self):
        xxx
    def test_one(self):
        pass
    @classmethod
    def tearDownClass(self):
        xxx
