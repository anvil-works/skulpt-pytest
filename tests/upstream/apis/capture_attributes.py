import sys

def test_capsys_results_accessible_by_attribute(capsys):
    sys.stdout.write("spam")
    sys.stderr.write("eggs")
    capture_result = capsys.readouterr()
    assert capture_result.out == "spam"
    assert capture_result.err == "eggs"
