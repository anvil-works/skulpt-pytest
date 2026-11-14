import unittest

class MyTestCase(unittest.TestCase):
    @unittest.skip("skipping due to reasons")
    def test_skip(self):
         self.fail()
