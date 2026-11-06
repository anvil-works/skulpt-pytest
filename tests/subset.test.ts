import { expect, test } from "@rstest/core";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runTests, type Outcome, type TestEvent } from "../src/index";
import { runtime } from "./runtime";

const directory = new URL("./upstream/subset/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));
const groups: string[] = [...new Set<string>(manifest.entries.map((entry: { case: string }) => entry.case))];
const outcomes: Outcome[] = ["passed", "failed", "error", "skipped", "xfailed", "xpassed"];
function finished(events: TestEvent[]) {
  return events.flatMap(event => event.type === "test_updates" ? event.tests : [])
    .filter(test => test.result.status === "finished");
}

for (const group of groups) test(`upstream subset: ${group}`, async () => {
  const { Sk } = runtime();
  const root = new URL(`cases/${group}/`, directory);
  const files = Object.fromEntries(readdirSync(root).filter(name => name.endsWith(".py"))
    .map(name => [join("tests/client_tests", name), readFileSync(new URL(name, root), "utf8")]));
  const result = await runTests(Sk, { files });
  const entries = manifest.entries.filter((entry: { case: string }) => entry.case === group);
  const expected = entries[0].expectation ?? { passed: entries.length };
  const counts = Object.fromEntries(outcomes.map(name => [name, expected[name] ?? (name === "error" ? expected.setup_error ?? 0 : 0)]));
  expect(result.events.at(-1)).toMatchObject({ status: "complete", counts });
  expect(result.exitCode).toBe(expected.exit_code ?? (counts.failed || counts.error ? 1 : 0));
  if (expected.ids) expect(finished(result.events).map(test => test.test_id.split("::")[1])).toEqual(expected.ids);
  if (expected.id_suffixes) expect(finished(result.events).map(test => test.test_id.match(/\[(.*)\]$/)![1])).toEqual(expected.id_suffixes);
  if (expected.message) expect(JSON.stringify(result.events)).toContain(expected.message);
  if (expected.message_contains) expect(JSON.stringify(result.events)).toContain(expected.message_contains);
});

test("parametrized cases have stable unique IDs, per-row marks and selectable function IDs", async () => {
  const { Sk } = runtime();
  const files = { "test_cases.py": `import pytest
@pytest.mark.parametrize('value', [pytest.param(1, id='same'), pytest.param(2, id='same'), pytest.param(3, id='skip', marks=pytest.mark.skip(reason='unsupported'))])
def test_cases(value):
    assert value > 0
@pytest.mark.parametrize('value', [pytest.param(1, marks=pytest.mark.xfail(strict=True, reason='known'))])
def test_expected(value):
    assert value == 2
` };
  const all = await runTests(Sk, { files });
  expect(all.exitCode).toBe(0);
  expect(finished(all.events).map(test => [test.test_id, test.result.outcome])).toEqual([
    ["test_cases.py::test_cases[same0]", "passed"], ["test_cases.py::test_cases[same1]", "passed"],
    ["test_cases.py::test_cases[skip]", "skipped"], ["test_cases.py::test_expected[1]", "xfailed"],
  ]);
  expect(finished((await runTests(Sk, { files, targets: ["test_cases.py::test_cases"] })).events)).toHaveLength(3);
  expect(finished((await runTests(Sk, { files, targets: ["test_cases.py::test_cases[same1]"] })).events)).toHaveLength(1);
});

test("monkeypatch restores attributes and mappings after failure and context exit", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_patch.py": `import pytest
class Service:
    value = 'original'
data = {'value': 1}
def test_patch(monkeypatch):
    monkeypatch.setattr(Service, 'value', 'changed')
    monkeypatch.setitem(data, 'value', 2)
    with monkeypatch.context() as patch:
        patch.setattr(Service, 'value', 'inner')
    assert Service.value == 'changed'
    assert False
def test_restored():
    assert Service.value == 'original'
    assert data == {'value': 1}
` } });
  expect(finished(result.events).map(test => test.result.outcome)).toEqual(["failed", "passed"]);
});

test("scoped fixture cleanup resumes after suspensions and continues after finalizer errors", async () => {
  const { Sk, output } = runtime();
  Sk.builtins.pause = new Sk.builtin.func(() => Sk.misceval.promiseToSuspension(Promise.resolve(Sk.builtin.none.none$)));
  const result = await runTests(Sk, { files: { "test_lifetime.py": `import pytest
@pytest.fixture(scope='session')
def shared(request):
    request.addfinalizer(lambda: print('session closed'))
    return []
@pytest.fixture
def resource(shared, request):
    shared.append(1)
    request.addfinalizer(lambda: print('last cleanup'))
    def broken():
        pause()
        raise ValueError('cleanup failed')
    request.addfinalizer(broken)
    yield shared
    pause()
    print('yield cleanup')
def test_lifetime(resource, request):
    assert request.getfixturevalue('shared') is resource
    pause()
    assert resource == [1]
` } });
  expect(result.exitCode).toBe(1);
  expect(finished(result.events)[0].result.errors![0]).toMatchObject({ phase: "teardown", message: "cleanup failed" });
  expect(output.join("")).toBe("yield cleanup\nlast cleanup\nsession closed\n");
});

test("not-run marks avoid fixture setup and empty parameters skip without executing the body", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_notrun.py": `import pytest
@pytest.fixture(autouse=True)
def forbidden():
    assert False, 'setup must not run'
@pytest.mark.xfail(run=False, reason='unsafe')
def test_notrun():
    assert False
@pytest.mark.parametrize('value', [])
def test_empty(value):
    assert False
` } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events).map(test => test.result.outcome)).toEqual(["xfailed", "skipped"]);
});

test("malformed parametrization and unsupported shapes fail explicitly", async () => {
  const { Sk } = runtime();
  const invalid = await runTests(Sk, { files: { "test_bad.py": "import pytest\n@pytest.mark.parametrize('x,y', [(1,)])\ndef test_bad(x,y): pass\n" } });
  expect(invalid.exitCode).toBe(2);
  const shapes = await runTests(Sk, { files: { "test_shapes.py": `import pytest
def test_shapes(monkeypatch):
    with pytest.raises(TypeError):
        pytest.approx([[1]])
    with pytest.raises(TypeError):
        pytest.approx({1, 2})
    with pytest.raises(NotImplementedError):
        monkeypatch.setenv('X', 'value')
` } });
  expect(shapes.exitCode).toBe(0);
});

test("session requests retain their defining fixture environment across test modules", async () => {
  const { Sk, output } = runtime();
  const result = await runTests(Sk, { files: {
    "conftest.py": `import pytest
@pytest.fixture(scope='session')
def dependency():
    return 'root'
@pytest.fixture(scope='session')
def shared(request):
    assert request.getfixturevalue('dependency') == 'root'
    request.addfinalizer(lambda: print(request.getfixturevalue('dependency')))
`,
    "test_a.py": "def test_a(shared): pass\n",
    "test_b.py": `import pytest
@pytest.fixture(scope='session')
def dependency():
    return 'override'
def test_b(dependency):
    assert dependency == 'override'
`,
  } });
  expect(result.exitCode).toBe(0);
  expect(output.join("")).toBe("root\n");
});

test("dynamic dependants are unavailable after their cleanup but before dependency cleanup", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_dynamic.py": `import pytest
@pytest.fixture(scope='session')
def resource(request):
    yield []
    with pytest.raises(AssertionError):
        request.getfixturevalue('inner')
@pytest.fixture(scope='session')
def inner(request):
    value = request.getfixturevalue('resource')
    yield value
def test_dynamic(inner):
    assert inner == []
` } });
  expect(result.exitCode).toBe(0);
});

test("strict XPASS remains a failure even when teardown is expected to fail", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_strict.py": `import pytest
@pytest.fixture
def cleanup():
    yield
    raise ValueError('teardown failed')
@pytest.mark.xfail(strict=True, reason='known failure')
def test_strict(cleanup):
    pass
@pytest.mark.xfail(strict=False, reason='known failure')
def test_nonstrict(cleanup):
    pass
` } });
  expect(result.exitCode).toBe(1);
  expect(finished(result.events).map(test => test.result.outcome)).toEqual(["failed", "xfailed"]);
  expect(finished(result.events)[0].result.errors![0]).toMatchObject({ phase: "call", message: "[XPASS(strict)] known failure" });
});

test("function and parameter marks take precedence over module defaults", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_marks.py": `import pytest
pytestmark = pytest.mark.xfail(strict=False, reason='module default')
@pytest.mark.xfail(strict=True, reason='function')
def test_function():
    pass
@pytest.mark.parametrize('value', [pytest.param(1, marks=pytest.mark.xfail(strict=True, reason='row'))])
def test_row(value):
    pass
@pytest.mark.xfail(strict=False, reason='function first')
@pytest.mark.parametrize('value', [pytest.param(1, marks=pytest.mark.xfail(strict=True, reason='row second'))])
def test_function_first(value):
    pass
` } });
  expect(result.exitCode).toBe(1);
  expect(finished(result.events).map(test => [test.result.outcome, test.result.reason])).toEqual([
    ["failed", "function"], ["failed", "row"], ["xpassed", "function first"],
  ]);
});

test("approximate numeric tolerances never make different boolean fields equal", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_bool.py": `import pytest
def test_boolean_fields():
    assert {'enabled': False} != pytest.approx({'enabled': True}, abs=2)
    assert 1 != pytest.approx(True)
    assert True != pytest.approx(1)
    assert True == pytest.approx(True)
    assert [False] == pytest.approx([False])
` } });
  expect(result.exitCode).toBe(0);
});

test("exact parameter selection treats bracket and separator characters as ID data", async () => {
  const { Sk } = runtime();
  const files = { "test_ids.py": `import pytest
@pytest.mark.parametrize('value', [pytest.param(1, id='x'), pytest.param(2, id='x][y'), pytest.param(3, id='x]/extra'), pytest.param(4, id='x]::extra')])
def test_ids(value):
    assert value == 1
` };
  const result = await runTests(Sk, { files, targets: ["test_ids.py::test_ids[x]"] });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events).map(test => test.test_id)).toEqual(["test_ids.py::test_ids[x]"]);
});
