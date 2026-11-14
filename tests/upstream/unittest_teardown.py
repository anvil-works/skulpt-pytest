import unittest
class MyTestCase(unittest.TestCase):
    values = []
    def test_one(self):
        pass
    def tearDown(self):
        self.values.append(None)
class Second(unittest.TestCase):
    def test_check(self):
        self.assertEqual(MyTestCase.values, [None])
