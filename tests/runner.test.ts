import { expect, test } from "@rstest/core";
import { readFileSync } from "node:fs";
import { runTests, type TestEvent } from "../src/index";
import { runtime } from "./runtime";

function upstream(name: string) { return readFileSync(new URL(`./upstream/${name}.py`, import.meta.url), "utf8"); }
function finished(events: TestEvent[]) {
  return events.flatMap(event => event.type === "test_updates" ? event.tests : [])
    .filter(test => test.result.status === "finished");
}

test("runs upstream unittest methods and reports the assertion traceback", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_simple.py": upstream("unittest_simple") } });
  expect(result.exitCode).toBe(1);
  expect(finished(result.events).map(({ test_id, result }) => [test_id, result.outcome])).toEqual([
    ["test_simple.py::MyTestCase::test_failing", "failed"],
    ["test_simple.py::MyTestCase::testpassing", "passed"],
  ]);
  expect(finished(result.events)[0].result.errors?.[0]).toMatchObject({
    type: "AssertionError",
    traceback: expect.stringContaining("self.assertEqual('foo', 'bar')"),
  });
});

test("reuses upstream unittest instance and lifecycle cases", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: {
    "test_double_failure.py": upstream("unittest_double_failure"),
    "test_instances.py": upstream("unittest_instances"),
    "test_setup_failure.py": upstream("unittest_setup_failure"),
    "test_teardown.py": upstream("unittest_teardown"),
  } });
  expect(result.exitCode).toBe(1);
  const results = finished(result.events).map(test => test.result);
  expect(results.map(result => result.outcome)).toEqual(["failed", "passed", "passed", "failed", "passed", "passed"]);
  expect(results[0].errors?.map(error => error.message)).toEqual(["down2", "down1"]);
  expect(results[3].errors?.[0].traceback).toContain("assert 0");
  expect(results[3].stdout).toBeUndefined();
});

test("reuses upstream unittest skip and runTest cases", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: {
    "test_run_test.py": upstream("unittest_run_test"),
    "test_skip_class.py": upstream("unittest_skip_class"),
    "test_skip_method.py": upstream("unittest_skip_method"),
    "test_skip_raised.py": upstream("unittest_raise_skip"),
  } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events).map(({ test_id, result }) => [test_id, result.outcome, result.reason])).toEqual([
    ["test_run_test.py::MyTestCaseWithRunTest::runTest", "passed", undefined],
    ["test_run_test.py::MyTestCaseWithoutRunTest::test_something", "passed", undefined],
    ["test_skip_class.py::MyTestCase::test_one", "skipped", "hello"],
    ["test_skip_method.py::MyTestCase::test_skip", "skipped", "skipping due to reasons"],
    ["test_skip_raised.py::MyTestCase::test_one", "skipped", "skipping due to reasons"],
  ]);
});

test("distinguishes strict xfail failures from unexpected unittest passes", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_xfail.py": `import pytest
import unittest

class TestKnown(unittest.TestCase):
    @pytest.mark.xfail(reason='known', strict=True)
    def test_failure(self):
        self.fail('boom')

    @pytest.mark.xfail(reason='known', strict=True)
    def test_pass(self):
        pass
` } });
  expect(result.exitCode).toBe(1);
  const [failure, pass] = finished(result.events).map(test => test.result);
  expect(failure).toMatchObject({ outcome: "xfailed", reason: "known" });
  expect(pass.errors?.[0].message).toBe("[XPASS(strict)] known");
});

test("does not silently pass a unittest generator method", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_generator_method.py": `import unittest

class TestGenerator(unittest.TestCase):
    def test_generator(self):
        yield 1
` } });
  expect(result.exitCode).toBe(1);
  expect(finished(result.events)[0].result.errors?.[0].message).toBe("generator tests are not supported");
});

test("runs pytest's exception assertion bodies", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "tests/client_tests/test_raises.py": upstream("raises") } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events)).toHaveLength(8);
});

test("enforces the native bridge's positional argument signatures", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_bridge.py": `import pytest
import _skulpt_pytest as host
def test_arguments():
    with pytest.raises(TypeError):
        host.files('unexpected')
    with pytest.raises(TypeError):
        host.targets(targets=[])
    with pytest.raises(TypeError):
        host.keyword_expression('unexpected')
    with pytest.raises(TypeError):
        host.collect_only('unexpected')
    with pytest.raises(TypeError):
        host.emit()
    with pytest.raises(TypeError):
        host.emit({}, {})
` } });
  expect(result.exitCode).toBe(0);
});

test("preserves pytest's yield setup/teardown behavior after passing and failing tests", async () => {
  const { Sk, output } = runtime();
  const result = await runTests(Sk, { files: { "test_yield.py": upstream("yield_lifecycle") } });
  expect(result.exitCode).toBe(1);
  expect(finished(result.events).map(test => test.result.outcome)).toEqual(["passed", "failed"]);
  expect(finished(result.events).map(test => test.result.stdout)).toEqual(["setup\ntest1 1\nteardown\n", "setup\ntest2 1\nteardown\n"]);
  expect(output).toEqual([]);
  const error = finished(result.events)[1].result.errors![0];
  expect(error.phase).toBe("call");
  expect(error.traceback).toContain("assert 0");
});

test("reuses upstream fixture and callable-instance collection cases", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: {
    "test_fixture.py": upstream("fixture_collection"),
    "test_callable.py": upstream("collection_callable"),
  } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events).map(test => test.test_id)).toEqual(["test_callable.py::test_real", "test_fixture.py::test_something"]);
});

test("reports transitive missing fixtures through the upstream suite", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_missing.py": upstream("missing_dependency") } });
  expect(result.exitCode).toBe(1);
  const error = finished(result.events)[0].result.errors![0];
  expect(error.phase).toBe("setup");
  expect(error.message).toBe("fixture 'missing' not found");
});

test("caches dependencies per test, resolves conftest fixtures and tears down every successful setup", async () => {
  const { Sk, output } = runtime();
  const result = await runTests(Sk, { files: {
    "tests/client_tests/conftest.py": `import pytest
@pytest.fixture
def base():
    print('base setup')
    yield []
    print('base cleanup')
@pytest.fixture
def broken(base):
    raise ValueError('setup failed')
@pytest.fixture
def outer(base):
    yield base
    print('outer cleanup')
    raise ValueError('teardown failed')
`,
    "tests/client_tests/test_suite.py": `import pytest
@pytest.fixture
def sibling(base):
    return base
def test_shared(base, sibling, outer):
    assert base is sibling is outer
def test_setup_failure(broken):
    assert False
def test_skip(base):
    pytest.skip('not available')
`,
  } });
  expect(finished(result.events).map(test => test.result.outcome)).toEqual(["error", "error", "skipped"]);
  expect(finished(result.events).map(test => test.result.stdout)).toEqual(["base setup\nouter cleanup\nbase cleanup\n", "base setup\nbase cleanup\n", "base setup\nbase cleanup\n"]);
  expect(output).toEqual([]);
});

test("waits for host suspensions and rejects concurrent runs without losing teardown", async () => {
  const { Sk, output } = runtime();
  let resume!: () => void;
  let signal!: () => void;
  const suspended = new Promise<void>(resolve => { signal = resolve; });
  Sk.builtins.pause = new Sk.builtin.func(() => Sk.misceval.promiseToSuspension(new Promise<void>(resolve => {
    resume = resolve;
    signal();
  })));
  const pending = runTests(Sk, { files: { "test_pause.py": `import pytest
@pytest.fixture
def resource():
    try:
        yield 41
    finally:
        print('cleaned')
def test_pause(resource):
    pause()
    assert resource == 42
` } });
  await Promise.race([suspended, pending.then(() => { throw new Error('test never suspended'); })]);
  await expect(runTests(Sk, { files: {} })).rejects.toThrow("already active");
  resume();
  const result = await pending;
  expect(result.exitCode).toBe(1);
  expect(finished(result.events)[0].result.stdout).toBe("cleaned\n");
  expect(output).toEqual([]);
  expect(finished(result.events)[0].result.errors![0].traceback).toContain("assert resource == 42");
});

test("isolates repeated test modules and reports collection errors and an empty selection", async () => {
  const { Sk } = runtime();
  const options = { files: { "test_repeat.py": "value = 0\ndef test_repeat():\n    global value\n    value += 1\n    assert value == 1\n" } };
  expect((await runTests(Sk, options)).exitCode).toBe(0);
  expect((await runTests(Sk, options)).exitCode).toBe(0);
  expect((await runTests(Sk, { ...options, targets: ["test_repeat.py::other"] })).exitCode).toBe(4);
  expect((await runTests(Sk, { files: {} })).exitCode).toBe(5);
  const broken = await runTests(Sk, { files: { "test_broken.py": "def broken(" } });
  expect(broken.exitCode).toBe(2);
  expect(broken.events.at(-1)).toMatchObject({ status: "complete", collection_errors: [{ type: "SyntaxError" }] });
});

test("returns generator data as data, supports callable raises, and rejects generator tests", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_generators.py": `import pytest
@pytest.fixture
def values():
    return (value for value in (1, 2))
def test_values(values):
    assert list(values) == [1, 2]
def test_callable_raises():
    info = pytest.raises(ValueError, int, 'bad')
    assert info.type is ValueError
    assert info.match('invalid literal')
def test_generator():
    yield 1
    assert False
` } });
  const results = finished(result.events);
  expect(results.map(test => test.result.outcome)).toEqual(["passed", "passed", "failed"]);
  expect(results[2].result.errors![0]).toMatchObject({ type: "NotImplementedError", message: "generator tests are not supported" });
});

test("preserves host modules and cleans exact temporary keys even if a test changes its name", async () => {
  const { Sk } = runtime();
  await Sk.misceval.asyncToPromise(() => Sk.importModule("sys", false, true));
  const key = new Sk.builtin.str("_skulpt_pytest_0");
  const existing = new Sk.builtin.module();
  Sk.sysmodules.mp$ass_subscript(key, existing);
  const result = await runTests(Sk, { files: { "test_name.py": "__name__ = 'changed_by_test'\ndef test_ok(): assert True\n" } });
  expect(result.exitCode).toBe(0);
  expect(Sk.sysmodules.mp$lookup(key)).toBe(existing);
  expect(Sk.sysmodules.mp$lookup(new Sk.builtin.str("_skulpt_pytest_1"))).toBeUndefined();
  expect(Sk.sysmodules.mp$lookup(new Sk.builtin.str("changed_by_test"))).toBeUndefined();
});

test("continues reporting after an exception with a broken string representation", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_bad_str.py": `class Broken(Exception):
    def __str__(self):
        raise ValueError('broken string')
def test_bad():
    raise Broken()
def test_later():
    assert True
` } });
  expect(result.exitCode).toBe(1);
  expect(finished(result.events).map(test => test.result.outcome)).toEqual(["failed", "passed"]);
  expect(finished(result.events)[0].result.errors![0].message).toContain("unprintable Broken object");
  expect(result.events.at(-1)).toMatchObject({ status: "complete" });
});

test("extends an ancestor fixture with the same fixture name", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: {
    "conftest.py": upstream("override_conftest"),
    "sub/test_override.py": upstream("override_tests"),
  } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events)).toHaveLength(1);
});

test("does not trigger __getattr__ on lazy module-level proxies during collection", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_proxy.py": `
class LazyProxy:
    def __getattr__(self, name):
        raise RuntimeError("unexpected attribute lookup: " + name)

app_tables = LazyProxy()
TestProxy = LazyProxy()
test_proxy = LazyProxy()

def test_ok():
    assert type(app_tables) is LazyProxy
    assert type(TestProxy) is LazyProxy
    assert type(test_proxy) is LazyProxy
` } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events).map(({ test_id, result }) => [test_id, result.outcome])).toEqual([
    ["test_proxy.py::test_ok", "passed"],
  ]);
});

test("supports collectOnly without running tests or fixtures", async () => {
  const { Sk } = runtime();
  const files = {
    "client_tests/conftest.py": `import pytest
@pytest.fixture(scope="session", autouse=True)
def fail_if_run():
    raise RuntimeError("fixture must not run during collectOnly")
`,
    "client_tests/test_alpha.py": `import pytest
@pytest.mark.parametrize("n", [1, 2])
def test_param(n):
    raise RuntimeError("test must not run")
`,
    "client_tests/test_beta.py": `def test_click():
    raise RuntimeError("test must not run")
`,
  };
  const result = await runTests(Sk, { files, collectOnly: true });
  expect(result.exitCode).toBe(0);
  expect(result.events.map(event => event.type)).toEqual(["test_run_update", "discovered_tests", "test_run_update"]);
  expect(result.events[1]).toEqual({
    type: "discovered_tests",
    tests: [
      { test_id: "client_tests/test_alpha.py::test_param[1]", file_path: "client_tests/test_alpha.py", line: 2, name: "test_param[1]" },
      { test_id: "client_tests/test_alpha.py::test_param[2]", file_path: "client_tests/test_alpha.py", line: 2, name: "test_param[2]" },
      { test_id: "client_tests/test_beta.py::test_click", file_path: "client_tests/test_beta.py", line: 1, name: "test_click" },
    ],
  });
  expect(result.events[2]).toEqual({ type: "test_run_update", status: "complete", exit_code: "OK" });

  const empty = await runTests(Sk, { files: {}, collectOnly: true });
  expect(empty.exitCode).toBe(5);
  expect(empty.events.at(-1)).toEqual({ type: "test_run_update", status: "complete", exit_code: "NO_TESTS_COLLECTED" });

  const deselected = await runTests(Sk, { files, collectOnly: true, keywordExpression: "nonexistent" });
  expect(deselected.exitCode).toBe(5);
  expect(deselected.events.at(-1)).toEqual({ type: "test_run_update", status: "complete", exit_code: "NO_TESTS_COLLECTED" });
});

test("filters tests with pytest -k keyword expressions and reports syntax errors as USAGE_ERROR", async () => {
  const { Sk } = runtime();
  const files = {
    "client_tests/sub/test_ui.py": `import pytest

@pytest.mark.parametrize("color", ["Red", "Blue"])
def test_color(color):
    assert color in ("Red", "Blue")

def test_fast():
    assert True
test_fast.smoke = True

def test_box_open():
    assert True
`,
    "client_tests/test_other.py": `import pytest
pytestmark = pytest.mark.skipif(False, reason="active")

def test_other_ok():
    assert True
`,
  };

  const runFilter = async (keywordExpression: string, targets?: string[]) => {
    const result = await runTests(Sk, { files, keywordExpression, ...(targets ? { targets } : {}) });
    return {
      exitCode: result.exitCode,
      discovered: result.events.find(e => e.type === "discovered_tests")?.tests.length,
      ran: finished(result.events).map(t => t.test_id),
      complete: result.events.at(-1),
    };
  };

  expect(await runFilter("color and blue")).toMatchObject({
    exitCode: 0,
    discovered: 5,
    ran: ["client_tests/sub/test_ui.py::test_color[Blue]"],
  });
  expect(await runFilter("test_color[Red] or (box and open)")).toMatchObject({
    exitCode: 0,
    ran: [
      "client_tests/sub/test_ui.py::test_color[Red]",
      "client_tests/sub/test_ui.py::test_box_open",
    ],
  });
  expect(await runFilter("not color and not skipif")).toMatchObject({
    exitCode: 0,
    ran: [
      "client_tests/sub/test_ui.py::test_fast",
      "client_tests/sub/test_ui.py::test_box_open",
    ],
  });
  expect(await runFilter("smoke or skipif")).toMatchObject({
    exitCode: 0,
    ran: [
      "client_tests/sub/test_ui.py::test_fast",
      "client_tests/test_other.py::test_other_ok",
    ],
  });
  expect(await runFilter("sub and not not parametrize", ["client_tests/sub/test_ui.py"])).toMatchObject({
    exitCode: 0,
    ran: [
      "client_tests/sub/test_ui.py::test_color[Red]",
      "client_tests/sub/test_ui.py::test_color[Blue]",
    ],
  });
  expect(await runFilter("   ")).toMatchObject({
    exitCode: 0,
    ran: [
      "client_tests/sub/test_ui.py::test_color[Red]",
      "client_tests/sub/test_ui.py::test_color[Blue]",
      "client_tests/sub/test_ui.py::test_fast",
      "client_tests/sub/test_ui.py::test_box_open",
      "client_tests/test_other.py::test_other_ok",
    ],
  });
  expect(await runFilter("AND")).toMatchObject({
    exitCode: 5,
    ran: [],
    complete: { exit_code: "NO_TESTS_COLLECTED" },
  });
  const emptySelection = await runTests(Sk, { files, keywordExpression: "AND" });
  expect(emptySelection.events.some(e => e.type === "test_run_update" && e.status === "running_tests")).toBe(false);

  expect(await runFilter("test_ui.py::test_color")).toMatchObject({
    exitCode: 5,
    ran: [],
    complete: { exit_code: "NO_TESTS_COLLECTED" },
  });

  const colonParam = await runTests(Sk, {
    files: {
      "test_colon.py": `import pytest
@pytest.mark.parametrize("label", ["v1"], ids=["http::ok"])
def test_param(label):
    assert label == "v1"
`,
    },
    keywordExpression: "http::ok",
  });
  expect(colonParam.exitCode).toBe(0);
  expect(finished(colonParam.events).map(t => t.test_id)).toEqual(["test_colon.py::test_param[http::ok]"]);

  const badExprWithCollectionError = await runTests(Sk, {
    files: { "test_broken.py": "def broken(" },
    keywordExpression: "color and",
  });
  expect(badExprWithCollectionError.exitCode).toBe(4);
  expect(badExprWithCollectionError.events.at(-1)).toMatchObject({
    status: "complete",
    exit_code: "USAGE_ERROR",
    error: { type: "UsageError", message: expect.stringContaining("Wrong expression passed to '-k'") },
  });

  const deepParens = "(".repeat(200) + "color" + ")".repeat(200);
  for (const invalid of ["color and", "and color", "color fast", "(color", "color)", "()", "not", "color && fast", "color(a=1)", "color\n", deepParens]) {
    const res = await runFilter(invalid);
    expect(res.exitCode).toBe(4);
    expect(res.ran).toEqual([]);
    expect(res.complete).toMatchObject({
      status: "complete",
      exit_code: "USAGE_ERROR",
      error: { type: "UsageError", message: expect.stringContaining("Wrong expression passed to '-k'") },
    });
  }
});
