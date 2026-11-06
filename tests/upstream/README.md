# Upstream pytest cases

Pinned to [pytest 9.2.0 at ae1d0ff5](https://github.com/pytest-dev/pytest/commit/ae1d0ff57b8bd4252da9ade7353523ac0ac73281).
The complete MIT notice is in [licenses/pytest.txt](../../licenses/pytest.txt).
[manifest.json](manifest.json) records exact source links and adaptations.

- `raises.py`: eight test bodies. Six methods lose only their unused `self`
  parameter/class wrapper; two functions come from an embedded pytester module.
  Statements and assertions are unchanged. A private `_pytest._code` type check
  is excluded because this package does not implement pytest internals.
- `yield_lifecycle.py`: the embedded suite proving teardown after pass and fail.
- `fixture_collection.py`: fixture injection, excluding a test_-named fixture.
- `missing_dependency.py`: a transitive missing-fixture error.
- `collection_callable.py`: excluding a callable instance from collection.
  Upstream's warning assertion is outside this milestone.

Rstest's event assertions are new integration coverage; pytester's filesystem
and plugin harness is not reused. Browser, suspension, caching and repeated-run
checks are also new tests. This is a selected compatibility set, not full pytest.

`override_conftest.py` and `override_tests.py` adapt the parent-extending fixture
case at `fixtures.py:539`: the parent uses a scalar instead of parametrisation
and `request.param`; the child fixture/test bodies are unchanged. This checks
name-shadowing dependency resolution without claiming parametrisation support.
