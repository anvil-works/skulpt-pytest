import unittest
class MyTestCase(unittest.TestCase):
    values = []
    @classmethod
    def setUpClass(cls):
        def cleanup():
            cls.values.append(1)
        cls.addClassCleanup(cleanup)
    @classmethod
    def tearDownClass(cls):
        assert False
    def test_one(self):
        pass
    def test_two(self):
        pass
def test_cleanup_called_exactly_once():
    assert MyTestCase.values == [1]
