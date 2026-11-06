import { expect, test } from "@rstest/core";
import { runTests, type TestEvent } from "../src/index";
import { runtime } from "./runtime";

function finished(events: TestEvent[]) {
  return events.flatMap(event => event.type === "test_updates" ? event.tests : [])
    .filter(test => test.result.status === "finished");
}

test("captures separate setup, call and teardown output for passing and failing tests", async () => {
  const { Sk, output } = runtime();
  const result = await runTests(Sk, { files: { "test_output.py": `import sys
import pytest
@pytest.fixture
def resource():
    print('setup')
    sys.stderr.write('setup err\\n')
    yield
    print('teardown')
    sys.stderr.write('teardown err\\n')
def test_pass(resource):
    print('pass')
def test_fail(resource):
    sys.stderr.write('failure detail\\n')
    assert False
` } });
  expect(finished(result.events).map(test => test.result)).toMatchObject([
    { outcome: "passed", stdout: "setup\npass\nteardown\n", stderr: "setup err\nteardown err\n" },
    { outcome: "failed", stdout: "setup\nteardown\n", stderr: "setup err\nfailure detail\nteardown err\n" },
  ]);
  expect(output).toEqual([]);
});

test("capsys drains only its own output and disabled bypasses both capture layers", async () => {
  const { Sk, output } = runtime();
  const result = await runTests(Sk, { files: { "test_layers.py": `import sys
import pytest
@pytest.fixture
def before():
    print('before capsys')
def test_layers(before, capsys):
    print('consumed')
    assert capsys.readouterr().out == 'consumed\\n'
    with capsys.disabled():
        print('host only')
    print('remaining')
    sys.stderr.write('remaining err\\n')
` } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events)[0].result).toMatchObject({ stdout: "before capsys\nremaining\n", stderr: "remaining err\n" });
  expect(output.join("")).toBe("host only\n");
});

test("captures setup errors and broad fixture cleanup on the last selected test", async () => {
  const { Sk } = runtime();
  const result = await runTests(Sk, { files: { "test_errors.py": `import sys
import pytest
@pytest.fixture(scope='module')
def shared():
    print('module setup')
    yield
    sys.stderr.write('module teardown\\n')
@pytest.fixture
def broken(shared):
    print('broken setup')
    raise ValueError('cannot set up')
def test_broken(broken): pass
def test_last(shared): print('last test')
` } });
  expect(finished(result.events).map(test => test.result)).toMatchObject([
    { outcome: "error", stdout: "module setup\nbroken setup\n" },
    { outcome: "passed", stdout: "last test\n", stderr: "module teardown\n" },
  ]);
});

test("handlers created by module fixtures keep writing to the current test capture", async () => {
  const { Sk, output } = runtime();
  const result = await runTests(Sk, { files: { "test_handler.py": `import logging
import pytest
@pytest.fixture(scope='module')
def logger():
    logger = logging.getLogger('capture-output')
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)
    logger.setLevel(logging.WARNING)
    logger.propagate = False
    yield logger
    logger.warning('teardown')
    logger.removeHandler(handler)
def test_first(logger): logger.warning('first')
def test_second(logger): logger.warning('second')
` } });
  expect(result.exitCode).toBe(0);
  expect(finished(result.events).map(test => test.result.stderr)).toEqual(["first\n", "second\nteardown\n"]);
  expect(output).toEqual([]);
});
