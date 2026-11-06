def test_disabled(capsys):
    print('captured before')
    with capsys.disabled():
        print('while capture is disabled')
    print('captured after')
    assert capsys.readouterr() == ('captured before\ncaptured after\n', '')

def test_normal():
    print('test_normal executed')
