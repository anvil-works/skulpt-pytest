import unittest
class MyTestCase(unittest.TestCase):
    values = []
    def setUp(self):
        def cleanup():
            self.values.append(1)
        self.addCleanup(cleanup)
        assert False
    def test_one(self):
        pass
    def test_two(self):
        pass
def test_cleanup_called_the_right_number_of_times():
    assert MyTestCase.values == [1, 1]
