# Expanded upstream compatibility cases

Pinned to pytest 9.2.0 ae1d0ff57b8bd4252da9ade7353523ac0ac73281.
Exact source links, expectations and adaptations are in manifest.json; the full
MIT notice is licenses/pytest.txt in the repository root.

Most files preserve embedded suite sources or complete public-operation test
bodies. The two derived parametrisation suites replace HIDDEN_PARAM or string
conditions with supported forms; their changes are explicit in the manifest.
Outer pytester/plugin/filesystem/report harnesses are replaced by Rstest event
assertions. MonkeyPatch cases exclude the os.path dotted-import test; the six
selected bodies use only supported object/dictionary/context operations.
