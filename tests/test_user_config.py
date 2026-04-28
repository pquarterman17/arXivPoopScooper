"""Tests for scq.config.user — Python config loader."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scq.config import user as cfg  # noqa: E402
from scq.config.user import schema_aware_merge  # noqa: E402


@pytest.fixture
def fake_repo(tmp_path, monkeypatch):
    """Build a minimal fake repo with skeleton config files."""
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    (tmp_path / "pyproject.toml").write_text("[project]\nname='t'\n")
    (tmp_path / "src" / "config" / "defaults").mkdir(parents=True)
    (tmp_path / "src" / "config" / "schema").mkdir(parents=True)
    (tmp_path / "data" / "user_config").mkdir(parents=True)
    return tmp_path


def _write(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f)


# ─── load_config ───


def test_returns_defaults_when_no_override(fake_repo):
    _write(fake_repo / "src/config/defaults/digest.json",
           {"$schema": "x", "cadence": "daily", "maxPapers": 25, "lookbackDays": 1})
    _write(fake_repo / "src/config/schema/digest.schema.json", {
        "type": "object",
        "required": ["cadence", "maxPapers", "lookbackDays"],
        "properties": {
            "cadence": {"type": "string"},
            "maxPapers": {"type": "integer"},
            "lookbackDays": {"type": "integer"},
        },
    })
    r = cfg.load_config("digest", repo_root=fake_repo)
    assert r.source == "defaults"
    assert r.data == {"cadence": "daily", "maxPapers": 25, "lookbackDays": 1}
    assert r.errors == ()


def test_merges_user_override(fake_repo):
    _write(fake_repo / "src/config/defaults/digest.json",
           {"cadence": "daily", "maxPapers": 25, "lookbackDays": 1})
    _write(fake_repo / "src/config/schema/digest.schema.json", {"type": "object"})
    _write(fake_repo / "data/user_config/digest.json", {"maxPapers": 50})
    r = cfg.load_config("digest", repo_root=fake_repo)
    assert r.source == "merged"
    assert r.data == {"cadence": "daily", "maxPapers": 50, "lookbackDays": 1}


def test_validation_errors_are_collected_not_raised(fake_repo):
    _write(fake_repo / "src/config/defaults/digest.json",
           {"cadence": "daily", "maxPapers": "not a number"})
    _write(fake_repo / "src/config/schema/digest.schema.json", {
        "type": "object",
        "properties": {
            "cadence": {"type": "string"},
            "maxPapers": {"type": "integer"},
        },
    })
    r = cfg.load_config("digest", repo_root=fake_repo)
    assert r.errors  # at least one
    assert any("maxPapers" in e for e in r.errors)


def test_strips_meta_schema_key(fake_repo):
    _write(fake_repo / "src/config/defaults/digest.json",
           {"$schema": "x", "cadence": "daily"})
    _write(fake_repo / "src/config/schema/digest.schema.json", {
        "type": "object",
        "additionalProperties": False,
        "properties": {"cadence": {"type": "string"}},
    })
    r = cfg.load_config("digest", repo_root=fake_repo)
    assert "$schema" not in r.data
    assert r.errors == ()


def test_unknown_domain_raises(fake_repo):
    with pytest.raises(ValueError, match="unknown"):
        cfg.load_config("not-real")


def test_missing_defaults_file_raises(fake_repo):
    with pytest.raises(FileNotFoundError):
        cfg.load_config("digest", repo_root=fake_repo)


# ─── schema_aware_merge ───


SOURCES_SCHEMA = {
    "type": "object",
    "properties": {
        "sources": {
            "type": "array",
            "x-mergeKey": "id",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "enabled": {"type": "boolean"},
                },
            },
        },
    },
}


def test_id_merge_overrides_existing_entry():
    a = {"sources": [{"id": "arxiv", "enabled": True}, {"id": "prl", "enabled": False}]}
    b = {"sources": [{"id": "prl", "enabled": True}]}
    out = schema_aware_merge(a, b, SOURCES_SCHEMA)
    assert out == {"sources": [
        {"id": "arxiv", "enabled": True},
        {"id": "prl", "enabled": True},
    ]}


def test_id_merge_appends_new_entry():
    a = {"sources": [{"id": "arxiv", "enabled": True}]}
    b = {"sources": [{"id": "prxq", "label": "PRX Quantum", "enabled": True}]}
    out = schema_aware_merge(a, b, SOURCES_SCHEMA)
    assert [s["id"] for s in out["sources"]] == ["arxiv", "prxq"]


def test_id_merge_preserves_default_order():
    a = {"sources": [{"id": "a"}, {"id": "b"}, {"id": "c"}]}
    b = {"sources": [{"id": "d"}, {"id": "b", "enabled": True}]}
    out = schema_aware_merge(a, b, SOURCES_SCHEMA)
    assert [s["id"] for s in out["sources"]] == ["a", "b", "c", "d"]


def test_array_without_mergeKey_replaces():
    schema = {"type": "object", "properties": {"tags": {"type": "array", "items": {"type": "string"}}}}
    out = schema_aware_merge({"tags": ["a", "b"]}, {"tags": ["c"]}, schema)
    assert out == {"tags": ["c"]}


def test_no_schema_falls_back_to_deep_merge():
    out = schema_aware_merge({"a": 1, "b": {"x": 1}}, {"b": {"y": 2}}, None)
    assert out == {"a": 1, "b": {"x": 1, "y": 2}}


# ─── Real-world: every shipped default validates against its real schema ───


def test_every_shipped_default_validates():
    """Smoke test against the actual project files (not a fake_repo)."""
    # Only run when in a proper checkout
    repo = Path(__file__).resolve().parents[1]
    if not (repo / "src" / "config" / "defaults").is_dir():
        pytest.skip("not in a checkout with src/config/defaults")
    for domain in cfg.MANIFEST:
        r = cfg.load_config(domain, repo_root=repo)
        assert r.errors == (), f"{domain}: {r.errors}"


def test_load_all_returns_every_domain(fake_repo):
    permissive = {"type": "object"}
    for d in cfg.MANIFEST:
        _write(fake_repo / f"src/config/defaults/{d}.json", {"d": d})
        _write(fake_repo / f"src/config/schema/{d}.schema.json", permissive)
    everything = cfg.load_all(repo_root=fake_repo)
    assert set(everything.keys()) == set(cfg.MANIFEST)
    for d, r in everything.items():
        assert r.data == {"d": d}


def test_digest_recipients_objects_validate():
    """Smoke test the post-migration recipients shape against the real digest schema."""
    repo = Path(__file__).resolve().parents[1]
    schema_path = repo / "src" / "config" / "schema" / "digest.schema.json"
    if not schema_path.is_file():
        pytest.skip("digest schema not present")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    base_required = {"cadence": "daily", "maxPapers": 25, "lookbackDays": 1}

    # Valid: full object recipient + minimal object recipient
    valid = {
        **base_required,
        "recipients": [
            {"email": "you@example.com", "name": "You", "frequency": "daily", "enabled": True},
            {"email": "team@example.org", "frequency": "weekly"},
        ],
    }
    assert cfg._validate(valid, schema) == []

    # Invalid: missing required `email`
    missing_email = {**base_required, "recipients": [{"name": "no email"}]}
    errs = cfg._validate(missing_email, schema)
    assert any("email" in e for e in errs), f"expected an email-related error, got {errs}"

    # Invalid: malformed email triggers format check
    bad_email = {**base_required, "recipients": [{"email": "not an email"}]}
    assert cfg._validate(bad_email, schema), "malformed email should fail validation"

    # Invalid: frequency outside enum
    bad_freq = {**base_required, "recipients": [{"email": "a@b.co", "frequency": "monthly"}]}
    errs = cfg._validate(bad_freq, schema)
    assert any("frequency" in e for e in errs), f"expected a frequency error, got {errs}"
