import unittest
class MyTestCase(unittest.TestCase):
    @unittest.expectedFailure
    def test_failing_test_is_xfail(self):
        assert False
if __name__ == '__main__':
    unittest.main()
