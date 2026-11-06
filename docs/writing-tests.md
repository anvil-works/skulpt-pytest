# Writing browser Python tests

Use ordinary pytest function tests. The host supplies the sources under
`tests/client_tests/` and the app's Python modules; tests run inside Skulpt.

```python
import pytest
from MyApp import Pricing


@pytest.fixture
def rates(monkeypatch, request):
    table = {'standard': 0.2}
    monkeypatch.setattr(Pricing, 'rates', table)
    request.addfinalizer(table.clear)
    return table


@pytest.mark.parametrize('amount, expected', [
    pytest.param(10, 12, id='standard'),
    pytest.param(0, 0, id='zero'),
])
def test_total(amount, expected, rates):
    assert Pricing.total(amount) == pytest.approx(expected)


def test_invalid_amount(rates):
    with pytest.raises(ValueError, match='positive'):
        Pricing.total(-1)
```

Prefer function-scoped fixtures for mutable app state. `monkeypatch` restores
attributes and dictionary entries automatically, even after a test fails.
Register `request.addfinalizer(cleanup)` immediately after acquiring a resource
if a later setup step might fail. Yield fixtures also unwind after failed tests.
Module/session fixtures can share resources, but cannot depend on function fixtures.

Parametrisation produces separate case IDs and reports, making failures easier
to identify than a loop inside one test. `ids` can be a list or callable; individual
rows can carry skip/xfail marks. Indirect parametrisation passes values through
`request.param`. Fixture `params` currently requires function scope.

Use `pytest.mark.skipif(boolean, reason='...')` for a known unavailable capability.
Use `pytest.mark.xfail(reason='...', strict=True)` for a known failing behaviour:
when it unexpectedly passes, strict mode fails the run so the marker can be removed.
`xfail(run=False)` avoids both fixtures and the test body.

Skulpt's suspended host calls resume normally inside tests, fixtures and cleanup;
Python async test functions are not supported by this runtime. Test output uses
the host's output stream. There is no `tmp_path`, environment patching, `capsys`,
plugin loading or filesystem discovery. See the [API boundary](../README.md#supported-api)
before introducing another pytest feature.
