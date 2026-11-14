import unittest
class MyTestCase(unittest.TestCase):
    def testpassing(self):
        self.assertEqual('foo', 'foo')
    def test_failing(self):
        self.assertEqual('foo', 'bar')
