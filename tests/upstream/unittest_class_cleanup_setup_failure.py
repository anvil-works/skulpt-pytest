import unittest
class MyTestCase(unittest.TestCase):
    values = []
    @classmethod
    def setUpClass(cls):
        def cleanup():
            cls.values.append(1)
        cls.addClassCleanup(cleanup)
        assert False
    def test_one(self):
        pass
def test_cleanup_called_exactly_once():
    assert MyTestCase.values == [1]
