import pytest

def test_module_not_found_skips_by_default():
    with pytest.raises(pytest.skip.Exception):
        pytest.importorskip(
            "TestImportOrSkipExcType_test_module_not_found_skips_without_warning"
        )
