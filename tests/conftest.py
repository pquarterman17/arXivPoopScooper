"""Shared pytest helpers, including the language-neutral test-vector loader.

See ``tests/vectors/README.md`` for the JSON fixture format. Vectors are
parametrized via :func:`vectors_for` so adding a new vector file adds a new
test case automatically — no per-suite duplication.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

# Make ``scq`` importable from any test file
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

VECTORS_ROOT = Path(__file__).resolve().parent / "vectors"


def vectors_for(category: str) -> list[tuple[str, dict[str, Any]]]:
    """Load every vector in a category, sorted by filename.

    Returns a list of ``(file_name, payload)`` tuples suitable for
    ``@pytest.mark.parametrize`` — the file name becomes the test id so
    failures point at the source vector.
    """
    directory = VECTORS_ROOT / category
    if not directory.is_dir():
        raise FileNotFoundError(f"vector category not found: {directory}")
    out = []
    for path in sorted(directory.glob("*.json")):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        out.append((path.name, data))
    return out


# ─── Error normalization for schema-validation parity ───


_REQUIRED_RE = re.compile(r"^'([^']+)' is a required property$")
_ADDITIONAL_RE = re.compile(r"\('([^']+)' was unexpected\)")


def normalize_jsonschema_error(err: Any) -> dict[str, str]:
    """Translate a jsonschema ``ValidationError`` to ``{path, kind}``.

    Mirrors the shape of ``normalizeJsError`` in ``src/tests/_vectors.js`` so
    parity vectors compare apples to apples. The trick: jsonschema's
    ``absolute_path`` doesn't include the offending field for ``required`` /
    ``additionalProperties`` errors — those names live in the message text
    and need extracting.
    """
    path = _format_path(list(err.absolute_path))
    kind = err.validator
    if kind == "required":
        m = _REQUIRED_RE.match(err.message)
        if m:
            path = f"{path}.{m.group(1)}"
    elif kind == "additionalProperties":
        m = _ADDITIONAL_RE.search(err.message)
        if m:
            path = f"{path}.{m.group(1)}"
    return {"path": path, "kind": kind}


def _format_path(parts: list[Any]) -> str:
    """Format a jsonschema absolute_path as ``$.foo[1].bar`` (matches the JS side)."""
    out = ["$"]
    for p in parts:
        if isinstance(p, int):
            out.append(f"[{p}]")
        else:
            out.append(f".{p}")
    return "".join(out)
