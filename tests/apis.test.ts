import { expect, test } from "@rstest/core";
import { readFileSync } from "node:fs";
import { runTests, type TestEvent } from "../src/index";
import { runtime } from "./runtime";

function upstream(name: string) { return readFileSync(new URL(`./upstream/apis/${name}.py`, import.meta.url), "utf8"); }
function finished(events: TestEvent[]) {
  return events.flatMap(event => event.type === "test_updates" ? event.tests : [])
    .filter(test => test.result.status === "finished");
}

test("upstream capsys suites cover both streams, reset, fixture teardown and nested disabling", async () => {
  const { Sk, output } = runtime();
  const files = Object.fromEntries(["attributes", "disabled", "fixtures", "nested", "teardown"]
    .map(name => [`test_${name}.py`, upstream(`capture_${name}`)]));
  const result = await runTests(Sk, { files });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events)).toHaveLength(6);
  expect(finished(result.events).find(test => test.test_id === "test_teardown.py::test_a")!.result)
    .toMatchObject({ stdout: "setup out\ncall out\n", stderr: "setup err\ncall err\n" });
  expect(finished(result.events).find(test => test.test_id.endsWith("::test_normal"))!.result.stdout).toBe("test_normal executed\n");
  expect(output.join("")).toBe("while capture is disabled\nwhile capture is disabled 1\nwhile capture is disabled 2\nwhile capture is disabled 1 after\n");
});

for (const [name, reason] of [["module_skip", "skip_module_level"], ["import_skip", "foobarbaz"], ["import_skip_reason", "just because"]]) {
  test(`upstream collection skip: ${name}`, async () => {
    const { Sk } = runtime();
    const result = await runTests(Sk, { files: { "test_optional.py": upstream(name) } });
    expect(result.exitCode).toBe(5);
    expect(finished(result.events)).toEqual([]);
    expect(result.events.at(-1)).toMatchObject({ counts: { skipped: 1 }, collection_skips: [{ file_path: "test_optional.py", reason: expect.stringContaining(reason) }] });
  });
}

test("upstream module skip without explicit permission is a collection error", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_invalid.py": upstream("module_skip_error") } });
  expect(result.exitCode).toBe(2);
  expect(result.events.at(-1)).toMatchObject({ collection_errors: [{ message: expect.stringContaining("allow_module_level=True") }], counts: { skipped: 0 } });
});

test("capture restores exact write-only host streams after suspension, disabling, replacement and failure", async () => {
  const { Sk } = runtime();
  Sk.builtins.pause = new Sk.builtin.func(() => Sk.misceval.promiseToSuspension(Promise.resolve(Sk.builtin.none.none$)));
  Sk.builtinFiles.files["src/lib/capture_host.py"] = `class HostStream:
    def __init__(self): self.text = ''
    def write(self, text): self.text += text
out, err = HostStream(), HostStream()
`;
  const host = await Sk.misceval.asyncToPromise(() => Sk.importModule("capture_host", false, true));
  const sys = await Sk.misceval.asyncToPromise(() => Sk.importModule("sys", false, true));
  const original = [sys.$d.stdout, sys.$d.stderr];
  sys.$d.stdout = host.$d.out;
  sys.$d.stderr = host.$d.err;
  try {
    const result = await runTests(Sk, { onEvent(event) {
      if (event.type === "test_updates" && event.tests[0].result.status === "finished") {
        expect(sys.$d.stdout).toBe(host.$d.out);
        expect(sys.$d.stderr).toBe(host.$d.err);
      }
    }, files: { "test_capture.py": `import sys
import pytest
from capture_host import HostStream, out, err
def test_failure(capsys):
    print('consumed')
    assert capsys.readouterr().out == 'consumed\\n'
    with pytest.raises(ValueError):
        with capsys.disabled():
            print('visible')
            pause()
            raise ValueError('resume capture')
    print('unread out')
    sys.stderr.write('unread err\\n')
    pause()
    sys.stdout = HostStream()
    sys.stderr = HostStream()
    assert False, 'exercise cleanup after failure'
def test_restored():
    assert out.text == 'visible\\n'
    assert err.text == ''
    print('next test')
` } });
    expect(finished(result.events).map(test => test.result.outcome)).toEqual(["failed", "passed"]);
    expect(finished(result.events)[0].result).toMatchObject({ stdout: "unread out\n", stderr: "unread err\n" });
    expect(finished(result.events)[1].result.stdout).toBe("next test\n");
    expect(sys.$d.stdout).toBe(host.$d.out);
    expect(sys.$d.stderr).toBe(host.$d.err);
  } finally {
    [sys.$d.stdout, sys.$d.stderr] = original;
  }
});

test("cached conftest skips block the whole subtree and preserve unrelated modules", async () => {
  const { Sk } = runtime();
  const files = {
    "optional/conftest.py": "import pytest\npytest.skip('optional subtree')\nraise AssertionError('not reached')\n",
    "optional/test_a.py": "raise AssertionError('must not import')\n",
    "optional/sub/test_b.py": "raise AssertionError('must not import')\n",
    "test_healthy.py": "def test_healthy(): pass\n",
    "test_optional.py": "import pytest\ndef test_before(): assert False\npytest.skip('whole module', allow_module_level=True)\n",
  };
  const result = await runTests(Sk, { files });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events).map(test => test.test_id)).toEqual(["test_healthy.py::test_healthy"]);
  expect(result.events.at(-1)).toMatchObject({ counts: { passed: 1, skipped: 2 }, collection_skips: [
    { file_path: "optional/conftest.py", reason: "optional subtree" }, { file_path: "test_optional.py", reason: "whole module" },
  ] });
  const selected = await runTests(Sk, { files, targets: ["optional/test_a.py::test_not_imported"] });
  expect(selected.exitCode).toBe(5);
  expect(finished(selected.events)).toEqual([]);
  expect((await runTests(Sk, { files, targets: ["unknown.py::test_unknown"] })).exitCode).toBe(4);
});

test("importorskip returns the leaf, propagates broken imports and supports explicit ImportError skipping", async () => {
  const { Sk } = runtime();
  Object.assign(Sk.builtinFiles.files, {
    "src/lib/optional_pkg/__init__.py": "",
    "src/lib/optional_pkg/leaf.py": "value = 42\n",
    "src/lib/broken_optional.py": "raise ImportError('some specific problem')\n",
    "src/lib/missing_dependency.py": "import no_such_dependency_for_pytest\n",
    "src/lib/bad_optional.py": "raise RuntimeError('initialization bug')\n",
  });
  const result = await runTests(Sk, { files: {
    "test_upstream_missing.py": upstream("import_missing"),
    "test_imports.py": `import pytest
def test_imports():
    module = pytest.importorskip('optional_pkg.leaf')
    assert module.value == 42
    with pytest.raises(ImportError, match='some specific problem'):
        pytest.importorskip('broken_optional')
    with pytest.raises(pytest.skip.Exception, match='some specific problem'):
        pytest.importorskip('broken_optional', exc_type=ImportError)
    with pytest.raises(pytest.skip.Exception):
        pytest.importorskip('missing_dependency')
    with pytest.raises(RuntimeError, match='initialization bug'):
        pytest.importorskip('bad_optional')
    for invalid in ('x y z', 'x=y'):
        with pytest.raises(SyntaxError):
            pytest.importorskip(invalid)
    with pytest.raises(NotImplementedError, match='version comparisons'):
        pytest.importorskip('sys', minversion='1.0')
` } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events)).toHaveLength(2);
});

test("typed raises checks run after type and regex, preserve exceptions, and forward callable kwargs", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_check.py": `import pytest
def test_predicate():
    original = ValueError('specific')
    seen = []
    def check(error):
        seen.append(error)
        return 'truthy'
    with pytest.raises(ValueError, match='specific', check=check) as info:
        raise original
    assert info.value is original and seen == [original]
    with pytest.raises(AssertionError, match='did not return True'):
        with pytest.raises(ValueError, check=lambda error: False):
            raise original
    seen.clear()
    with pytest.raises(TypeError):
        with pytest.raises(ValueError, check=check):
            raise TypeError('wrong type')
    with pytest.raises(AssertionError, match='Regex pattern'):
        with pytest.raises(ValueError, match='different', check=check):
            raise original
    assert seen == []
    def broken(error): raise RuntimeError('predicate failed')
    with pytest.raises(RuntimeError, match='predicate failed'):
        with pytest.raises(ValueError, check=broken):
            raise original
def test_callable_kwargs():
    def function(check, match):
        raise ValueError(check + match)
    info = pytest.raises(ValueError, function, check='forwarded ', match='kwargs')
    assert info.value.args == ('forwarded kwargs',)
` } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events)).toHaveLength(2);
});
