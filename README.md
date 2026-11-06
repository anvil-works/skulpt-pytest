# skulpt-pytest

A first pytest-compatible module for Python running in Skulpt. Tests execute in
an existing browser Python environment, including app modules and suspended
JavaScript calls. This is an explicit API subset, not upstream pytest.

## Embedding

```ts
import { runTests } from '@anvil-works/skulpt-pytest';

const result = await runTests(Sk, {
  files: { 'tests/client_tests/test_example.py': 'def test_example(): assert 1 == 1' },
  onEvent: event => console.log(event),
});
console.log(result.exitCode);
```

Configure Skulpt normally. Its `read` callback must serve
`Sk.builtinFiles.files`, including any split stdlib chunks. `installPytest(Sk)`
registers the module sources there; `runTests` also calls it automatically.
The package preserves the host's imports, output and suspension handling and
ships without a Skulpt runtime dependency.

Supply `test_*.py`, `*_test.py` and relevant ancestor `conftest.py` files in the
manifest. App/support imports continue through the host's normal importer; the
manifest is not a filesystem. Each run re-creates its test modules and restores
their temporary module/source-cache entries afterwards. Imported app state
remains owned by the host; use a fresh browser/runtime for a fresh app.

`targets` selects virtual directories, files or `file.py::test_function` IDs.
Discovery imports all test modules before selection so it can report the full
inventory; a collection error in any of them prevents execution.
Events are `discovered_tests`, `test_updates` and `test_run_update`, with separate
setup/call/teardown errors. Output streams through `Sk.output`. Exit codes: 0
(passed), 1 (test/setup/teardown failure), 2 (collection error), 4 (unknown target)
and 5 (no tests). One run can be active per runtime. `Sk.pytest` holds its source,
targets, event callback and active state for the native bridge.

## Supported API

- Function tests and plain assertions with source and native tracebacks.
- `pytest.mark.parametrize`: names, rows, stacked combinations, IDs, `pytest.param`
  and indirect arguments. Empty parameter sets skip; malformed rows are errors.
- Function, module and session fixtures, conftest overrides, `autouse`, names,
  return/yield values and function-scoped fixture `params`/`ids`. Dependencies are
  cached per definition and scope; broader fixtures cannot use narrower ones.
- `request.param`, `scope`, `fixturename`, `addfinalizer` and `getfixturevalue`.
  Cached dependencies remain available during teardown; creating a new fixture
  during teardown fails explicitly.
- Function-scoped `monkeypatch` and `pytest.MonkeyPatch`: reversible object/class/
  module attributes, dotted import targets, dictionary entries, `context` and `undo`.
- `pytest.approx`: numeric scalars and flat lists/tuples/dicts, with relative and
  absolute tolerances and `nan_ok`. Nonnumeric entries compare exactly.
- `raises`, `fail`, `skip`, `xfail`; `skip`, boolean `skipif`, `xfail` and
  `usefixtures` marks on functions/parameter rows. Module `pytestmark` is supported.
  Skip and `xfail(run=False)` avoid setup. Strict XPASS fails; non-strict XPASS
  reports `xpassed` without failing. Conditional marks require a reason.

Results distinguish `passed`, `failed`, `error`, `skipped`, `xfailed` and `xpassed`.
Fixture cleanup is LIFO and continues after a cleanup error. Module fixtures close
at the last selected test of that module; session fixtures close before completion,
including when the host callback aborts a run.

Class/package/dynamic fixture scopes, parametrized module/session fixtures,
parametrisation `scope=`, keyword-only/positional-only fixture arguments, test
classes, generator tests, string mark conditions and CLI flags are unsupported.
There are no filesystem/environment fixtures, plugin hooks, stdout capture,
NumPy/Decimal/nested `approx`, hidden parameter IDs or assertion-value rewriting.
The chosen Skulpt formatter does not render exception groups or exception notes.

[Writing tests](docs/writing-tests.md) gives agents a copyable example and the
supported boundary. Sources remain supplied by the host; no npm Skulpt publish
is required for local development.

## Development

Use the Skulpt foundation at
[2f6f0b3b](https://github.com/anvil-works/skulpt/commit/2f6f0b3b93c8d7e0ec70ed8fe352c5b53dd498c7),
the tip of [the prerequisite PR stack](https://github.com/anvil-works/skulpt/pull/87).
An existing local `dist` is enough; no npm publish is needed.

```sh
pnpm install
pnpm exec playwright install chromium
export SKULPT_DIST=/absolute/path/to/skulpt/dist
pnpm test
pnpm check
pnpm build
pnpm test:package
pnpm dev
```

Without `SKULPT_DIST`, development looks in `../skulpt/dist`. CI builds the pinned
Skulpt commit. Library builds use Rslib, the browser harness uses Rsbuild, and
Node/browser tests use Rstest. The harness intentionally includes a failed test
so its traceback and fixture cleanup are visible.

Selected [upstream pytest tests](tests/upstream/README.md) retain source
attribution and the MIT licence. The new integration checks cover the host
boundary, suspension and fixture lifetimes.
