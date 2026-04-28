"""Parity tests run against language-neutral vectors in ``tests/vectors/``.

Mirrors src/tests/vectors/*.test.js. Adding a vector adds a test case here
automatically.
"""

from __future__ import annotations

import jsonschema  # type: ignore[import-untyped]
import pytest

from conftest import normalize_jsonschema_error, vectors_for
from scq.config.user import schema_aware_merge

# ─── config-merge ───


@pytest.mark.parametrize(
    "name, vec", vectors_for("config-merge"), ids=[name for name, _ in vectors_for("config-merge")]
)
def test_config_merge_vector(name: str, vec: dict) -> None:
    result = schema_aware_merge(vec["defaults"], vec["override"], vec["schema"])
    assert result == vec["expected"], f"{name}: merged result mismatch"


# ─── schema-validation ───


def _validate_to_set(payload, schema) -> set[str]:
    """Run validation, return a set of `<path>::<kind>` strings (order-independent)."""
    cleaned = dict(schema)
    cleaned.pop("$schema", None)
    cleaned.pop("$id", None)
    validator = jsonschema.Draft202012Validator(
        cleaned,
        format_checker=jsonschema.Draft202012Validator.FORMAT_CHECKER,
    )
    out: set[str] = set()
    for err in validator.iter_errors(payload):
        n = normalize_jsonschema_error(err)
        out.add(f"{n['path']}::{n['kind']}")
    return out


@pytest.mark.parametrize(
    "name, vec",
    vectors_for("schema-validation"),
    ids=[name for name, _ in vectors_for("schema-validation")],
)
def test_schema_validation_vector(name: str, vec: dict) -> None:
    got = _validate_to_set(vec["payload"], vec["schema"])
    expected = {f"{e['path']}::{e['kind']}" for e in vec["expectedErrors"]}
    assert got == expected, f"{name}: error set mismatch\n  got: {got}\n  expected: {expected}"
