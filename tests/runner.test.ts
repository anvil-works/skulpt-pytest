import { expect, test } from "@rstest/core";
import { readFileSync } from "node:fs";
import { runTests, type TestEvent } from "../src/index";
import { runtime } from "./runtime";

function upstream(name: string) { return readFileSync(new URL(`./upstream/${name}.py`, import.meta.url), "utf8"); }
function finished(events: TestEvent[]) {
  return events.flatMap(event => event.type === "test_updates" ? event.tests : [])
    .filter(test => test.result.status === "finished");
}

test("runs pytest's exception assertion bodies", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "tests/client_tests/test_raises.py": upstream("raises") } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events)).toHaveLength(8);
});

test("preserves pytest's yield setup/teardown behavior after passing and failing tests", async () => {
  const { Sk, output } = runtime();
  const result = await runTests(Sk, { files: { "test_yield.py": upstream("yield_lifecycle") } });
  expect(result.exitCode).toBe(1);
  expect(finished(result.events).map(test => test.result.outcome)).toEqual(["passed", "failed"]);
  expect(output.join("")).toBe("setup\ntest1 1\nteardown\nsetup\ntest2 1\nteardown\n");
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
  expect(output.join("")).toBe("base setup\nouter cleanup\nbase cleanup\nbase setup\nbase cleanup\nbase setup\nbase cleanup\n");
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
  expect(output.join("")).toBe("cleaned\n");
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
