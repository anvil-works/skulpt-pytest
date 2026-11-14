from unittest import TestCase

class T(TestCase):
    def test_foo(self):
        with self.subTest("foo subtest"):
            assert False, "foo subtest failure"

    def test_bar(self):
        with self.subTest("bar subtest"):
            assert False, "bar subtest failure"
        assert False, "test_bar also failed"

    def test_zaz(self):
        with self.subTest("zaz subtest"):
            pass
