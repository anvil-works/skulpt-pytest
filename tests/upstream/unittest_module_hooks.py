values = []

def setUpModule():
    values.append(1)

def tearDownModule():
    del values[0]

def test_hello():
    assert values == [1]

def test_world():
    assert values == [1]
