def test_disabled(capsys):
    print('captured before')
    with capsys.disabled():
        print('while capture is disabled 1')
        with capsys.disabled():
            print('while capture is disabled 2')
        print('while capture is disabled 1 after')
    print('captured after')
    assert capsys.readouterr() == ('captured before\ncaptured after\n', '')
