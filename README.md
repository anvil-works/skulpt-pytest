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
- `pytest.fixture`: ordinary named arguments, function scope, caching, `autouse`,
  custom names, conftest overrides, returned values and yield teardown. Successful
  setups unwind in reverse order after setup or test errors.
- `pytest.raises`: context-manager/callable forms, exception tuples, regex `match`,
  and exception info's `type`, `value`, `traceback` and `match`.
- `pytest.fail`, `pytest.skip`, and programmatic `pytest.main` over the manifest.

Other fixture scopes, fixture parametrisation, keyword-only/positional-only
fixture arguments, test classes, generator tests and CLI flags fail explicitly.
Marks, `parametrize`, `approx`, builtin fixtures such as `request`, plugin hooks, stdout
capture and assertion-value rewriting are not implemented. The chosen Skulpt
formatter does not render exception groups or exception notes.

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
