# Capture and collection API cases

Pinned to [pytest 9.2.0 at ae1d0ff5](https://github.com/pytest-dev/pytest/commit/ae1d0ff57b8bd4252da9ade7353523ac0ac73281).
Retained under the [MIT notice](../../../licenses/pytest.txt).
The original pytester filesystem/plugin harness is replaced by the source
manifest and host assertions in `tests/apis.test.ts`.

| File | Original test | Changes to embedded module/body |
| --- | --- | --- |
| `capture_attributes.py` | [test_capsys_results_accessible_by_attribute](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_capture.py#L1413) | Remove the `CaptureFixture[str]`/return annotations; add `import sys`. Body unchanged. |
| `capture_disabled.py` | [TestCaptureFixture.test_disabled_capture_fixture](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_capture.py#L675) | Render pytester's f-string with `fixture='capsys'`; both embedded functions unchanged. Host assertions check disabled text reaches the host and ordinary text joins the per-test report. |
| `capture_fixtures.py` | [TestCaptureFixture.test_fixture_use_by_other_fixtures](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_capture.py#L731) | Render `fixture='capsys'`; embedded module unchanged. |
| `capture_teardown.py` | [TestCaptureFixture.test_fixture_use_by_other_fixtures_teardown](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_capture.py#L765) | Render `cap='capsys'`; remove unused `import os`. Other embedded statements unchanged. |
| `capture_nested.py` | [TestCaptureFixture.test_disabled_capture_fixture_twice](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_capture.py#L703) | Derived: replace `capfd` with `capsys`; the browser does not capture file descriptors. |
| `module_skip.py` | [test_module_level_skip_with_allow_module_level](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_skipping.py#L1409) | Embedded module unchanged. |
| `module_skip_error.py` | [test_module_level_skip_error](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_skipping.py#L1392) | Embedded module unchanged; host asserts the public `allow_module_level=True` guidance. |
| `import_skip.py` | [test_importorskip_module_level](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_runner.py#L894) | Embedded module unchanged. |
| `import_skip_reason.py` | [test_importorskip_custom_reason](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_runner.py#L909) | Embedded module unchanged. |
| `import_missing.py` | [TestImportOrSkipExcType.test_module_not_found_skips_by_default](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/testing/test_runner.py#L841) | Remove class/unused `self` and return annotation; add `import pytest`. Body unchanged. |

The additional checks of typed `raises(check=...)`, exact host-stream restoration,
suspension, cached conftest skips, target handling and broken host imports are
new integration tests. Their contracts follow the pinned
[capture](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/src/_pytest/capture.py#L948),
[outcomes](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/src/_pytest/outcomes.py#L198)
and [raises](https://github.com/pytest-dev/pytest/blob/ae1d0ff57b8bd4252da9ade7353523ac0ac73281/src/_pytest/raises.py#L653)
implementations; no exception-group test is presented as directly reused.
