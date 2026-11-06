# pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281
# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_monkeypatch.py
# Original test bodies; public import prelude and removal of unused self only.
# Copyright (c) 2004 Holger Krekel and others. MIT; see licenses/pytest.txt in the repository root.

import pytest
from pytest import MonkeyPatch


# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_monkeypatch.py#L27
def test_setattr() -> None:
    class A:
        x = 1

    monkeypatch = MonkeyPatch()
    with pytest.raises(AttributeError):
        monkeypatch.setattr(A, "notexists", 2)
    monkeypatch.setattr(A, "y", 2, raising=False)
    assert A.y == 2  # type: ignore
    monkeypatch.undo()
    assert not hasattr(A, "y")

    monkeypatch = MonkeyPatch()
    monkeypatch.setattr(A, "x", 2)
    assert A.x == 2
    monkeypatch.setattr(A, "x", 3)
    assert A.x == 3
    monkeypatch.undo()
    assert A.x == 1

    A.x = 5
    monkeypatch.undo()  # double-undo makes no modification
    assert A.x == 5

    with pytest.raises(TypeError):
        monkeypatch.setattr(A, "y")  # type: ignore[call-overload]


# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_monkeypatch.py#L139
def test_setitem() -> None:
    d = {"x": 1}
    monkeypatch = MonkeyPatch()
    monkeypatch.setitem(d, "x", 2)
    monkeypatch.setitem(d, "y", 1700)
    monkeypatch.setitem(d, "y", 1700)
    assert d["x"] == 2
    assert d["y"] == 1700
    monkeypatch.setitem(d, "x", 3)
    assert d["x"] == 3
    monkeypatch.undo()
    assert d["x"] == 1
    assert "y" not in d
    d["x"] = 5
    monkeypatch.undo()
    assert d["x"] == 5

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_monkeypatch.py#L157
def test_setitem_deleted_meanwhile() -> None:
    d: dict[str, object] = {}
    monkeypatch = MonkeyPatch()
    monkeypatch.setitem(d, "x", 2)
    del d["x"]
    monkeypatch.undo()
    assert not d

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_monkeypatch.py#L182
def test_delitem() -> None:
    d: dict[str, object] = {"x": 1}
    monkeypatch = MonkeyPatch()
    monkeypatch.delitem(d, "x")
    assert "x" not in d
    monkeypatch.delitem(d, "y", raising=False)
    with pytest.raises(KeyError):
        monkeypatch.delitem(d, "y")
    assert not d
    monkeypatch.setitem(d, "y", 1700)
    assert d["y"] == 1700
    d["hello"] = "world"
    monkeypatch.setitem(d, "x", 1500)
    assert d["x"] == 1500
    monkeypatch.undo()
    assert d == {"hello": "world", "x": 1}

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_monkeypatch.py#L631
def test_context_classmethod() -> None:
    class A:
        x = 1

    with MonkeyPatch.context() as m:
        m.setattr(A, "x", 2)
        assert A.x == 2
    assert A.x == 1

# https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_monkeypatch.py#L473
def test_undo_inherited_attribute_on_instance() -> None:
    """Undo must not leave an inherited attribute behind in the instance dict.

    See #10644.
    """

    class Parent:
        x = 1

    class Child(Parent):
        pass

    obj = Child()
    monkeypatch = MonkeyPatch()

    monkeypatch.setattr(obj, "x", 2)
    assert obj.x == 2
    assert vars(obj)["x"] == 2

    monkeypatch.undo()
    assert obj.x == 1
    assert "x" not in vars(obj)
