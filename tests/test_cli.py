"""Tests for scq.cli — argument parsing and command dispatch.

Each test invokes ``main(['config', '...'])`` directly and inspects the
return code + captured output. No subprocess overhead.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scq.cli import main  # noqa: E402


def test_no_args_prints_help_and_exits_nonzero(capsys):
    rc = main([])
    out = capsys.readouterr().out
    assert rc == 1
    assert "scq" in out


def test_show_emits_json_for_all_domains(capsys):
    rc = main(["config", "show"])
    out = capsys.readouterr().out
    assert rc == 0
    payload = json.loads(out)
    assert isinstance(payload, dict)
    # Every shipped domain shows up
    from scq.config.user import MANIFEST
    assert set(MANIFEST).issubset(payload.keys())


def test_show_one_domain(capsys):
    rc = main(["config", "show", "digest"])
    out = capsys.readouterr().out
    assert rc == 0
    payload = json.loads(out)
    # Digest config has at least cadence + maxPapers per the schema's required list
    assert "cadence" in payload
    assert "maxPapers" in payload


def test_show_unknown_domain_raises(capsys):
    with pytest.raises(ValueError, match="unknown"):
        main(["config", "show", "not-a-real-domain"])


def test_get_extracts_a_key(capsys):
    rc = main(["config", "get", "digest", "maxPapers"])
    out = capsys.readouterr().out
    assert rc == 0
    assert json.loads(out) >= 1  # the default is 25


def test_get_nested_key(capsys):
    rc = main(["config", "get", "search-sources", "autoFetch.enabled"])
    out = capsys.readouterr().out
    assert rc == 0
    # Just check it parses as a JSON value
    json.loads(out)


def test_get_missing_key_returns_1(capsys):
    rc = main(["config", "get", "digest", "doesNotExist"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "not found" in err


def test_validate_all_clean_exit_0(capsys):
    rc = main(["config", "validate"])
    out = capsys.readouterr().out
    assert rc == 0
    # Each domain reports "ok"
    from scq.config.user import MANIFEST
    for d in MANIFEST:
        assert f"{d}: ok" in out


def test_validate_one_domain(capsys):
    rc = main(["config", "validate", "digest"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "digest: ok" in out


def test_paths_emits_json(capsys):
    rc = main(["config", "paths"])
    out = capsys.readouterr().out
    assert rc == 0
    payload = json.loads(out)
    assert "db_path" in payload
    assert "papers_dir" in payload
    assert payload["db_path"].endswith("scq_papers.db")


def test_has_secret_returns_0_when_set(monkeypatch):
    monkeypatch.setenv("SCQ_TEST_KEY", "value")
    assert main(["config", "has-secret", "test_key"]) == 0


def test_has_secret_returns_1_when_unset(monkeypatch):
    monkeypatch.delenv("SCQ_TEST_KEY", raising=False)
    assert main(["config", "has-secret", "test_key"]) == 1


def test_set_secret_without_keyring_returns_2(monkeypatch, capsys):
    # Force keyring_available to return False
    from scq.config import secrets as secrets_mod
    monkeypatch.setattr(secrets_mod, "keyring_available", lambda: False)
    rc = main(["config", "set-secret", "anything"])
    err = capsys.readouterr().err
    assert rc == 2
    assert "pip install" in err
    assert "keyring" in err
