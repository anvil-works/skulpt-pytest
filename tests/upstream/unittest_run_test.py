import unittest
class MyTestCaseWithRunTest(unittest.TestCase):
    def runTest(self):
        self.assertEqual('foo', 'foo')
class MyTestCaseWithoutRunTest(unittest.TestCase):
    def runTest(self):
        self.assertEqual('foo', 'foo')
    def test_something(self):
        pass
