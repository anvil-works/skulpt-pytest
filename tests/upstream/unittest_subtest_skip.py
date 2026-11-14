from unittest import TestCase, main

class T(TestCase):

    def test_foo(self):
        for i in range(5):
            with self.subTest(msg="custom", i=i):
                if i % 2 == 0:
                    self.skipTest('even number')
