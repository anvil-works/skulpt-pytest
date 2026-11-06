import api from "./python/pytest/__init__.py?raw";
import runner from "./python/pytest/_runner.py?raw";
import native from "./native.js?raw";
import marks from "./python/pytest/_marks.py?raw";
import fixtures from "./python/pytest/_fixtures.py?raw";
import monkeypatch from "./python/pytest/_monkeypatch.py?raw";
import approx from "./python/pytest/_approx.py?raw";

export type Outcome = "passed" | "failed" | "error" | "skipped" | "xfailed" | "xpassed";
export interface TestError { phase: "setup" | "call" | "teardown"; type: string; message: string; traceback: string }
export interface TestResult {
  status: "running" | "finished";
  outcome?: Outcome;
  duration?: number;
  errors?: TestError[];
  reason?: string;
}
export interface DiscoveredTest { test_id: string; file_path: string; line: number; name: string }
export type TestEvent =
  | { type: "discovered_tests"; tests: DiscoveredTest[] }
  | { type: "test_updates"; tests: { test_id: string; result: TestResult }[] }
  | { type: "test_run_update"; status: "collecting_tests" | "running_tests" | "complete";
      counts?: Record<Outcome, number>; exit_code?: string;
      error?: { type: string; message: string };
      collection_errors?: (Omit<TestError, "phase"> & { file_path: string })[] };

export interface RunOptions {
  /** Python source keyed by virtual path, including any conftest.py files. */
  files: Record<string, string>;
  targets?: string[];
  onEvent?: (event: TestEvent) => void;
}

interface HostState extends RunOptions { active: boolean; emit: (event: TestEvent) => void }
interface PythonModule { $d: { main: unknown } }
/** The embedding surface used by this package; the host owns configuration and imports. */
export interface SkulptRuntime {
  builtinFiles: { files: Record<string, string | number> };
  importModule(name: string, dumpJS: boolean, canSuspend: boolean): unknown;
  misceval: {
    asyncToPromise<T>(fn: () => unknown): Promise<T>;
    callsimOrSuspendArray(fn: unknown, args: unknown[]): unknown;
  };
  pytest?: HostState;
}

/** Register ordinary Skulpt library files. The host's read callback must serve builtinFiles. */
export function installPytest(Sk: SkulptRuntime): void {
  Object.assign(Sk.builtinFiles.files, {
    "src/lib/pytest/__init__.py": api,
    "src/lib/pytest/_runner.py": runner,
    "src/lib/pytest/_marks.py": marks,
    "src/lib/pytest/_fixtures.py": fixtures,
    "src/lib/pytest/_monkeypatch.py": monkeypatch,
    "src/lib/pytest/_approx.py": approx,
    "src/lib/_skulpt_pytest.js": native,
  });
}

/** Run in the host's existing Python environment, including its app modules and suspensions. */
export async function runTests(Sk: SkulptRuntime, options: RunOptions) {
  if (Sk.pytest?.active) throw new Error("A pytest run is already active in this Skulpt runtime");
  installPytest(Sk);
  const events: TestEvent[] = [];
  const state: HostState = {
    ...options,
    active: true,
    emit(event) { events.push(event); state.onEvent?.(event); },
  };
  Sk.pytest = state;
  try {
    const pytest = await Sk.misceval.asyncToPromise<PythonModule>(() => Sk.importModule("pytest", false, true));
    const code = await Sk.misceval.asyncToPromise<{ v: number }>(() =>
      Sk.misceval.callsimOrSuspendArray(pytest.$d.main, []));
    return { exitCode: code.v, events };
  } catch (error) {
    // Python exceptions are Skulpt objects, not JavaScript Error instances.
    throw new Error(String(error), { cause: error });
  } finally {
    state.active = false;
  }
}
