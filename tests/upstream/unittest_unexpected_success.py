import unittest
class MyTestCase(unittest.TestCase):
    @unittest.expectedFailure
    def test_passing_test_is_fail(self):
        assert True
if __name__ == '__main__':
    unittest.main()
