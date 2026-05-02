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
    assert payload["db_path"].endswith("scientific_litter_scoop.db")


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


# ─── scq init ───


def test_init_creates_fresh_db(tmp_path, capsys):
    db = tmp_path / "scientific_litter_scoop.db"
    rc = main(["init", "--db-path", str(db)])
    out = capsys.readouterr().out
    assert rc == 0
    assert db.exists()
    assert "Created" in out or "Migrated" in out
    # Schema actually present
    import sqlite3
    c = sqlite3.connect(db)
    try:
        tables = {r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
    finally:
        c.close()
    assert "papers" in tables
    assert "schema_version" in tables


def test_init_idempotent_on_empty_db(tmp_path, capsys):
    db = tmp_path / "scientific_litter_scoop.db"
    main(["init", "--db-path", str(db)])
    capsys.readouterr()  # discard
    rc = main(["init", "--db-path", str(db)])
    out = capsys.readouterr().out
    assert rc == 0
    assert "up to date" in out


def test_init_refuses_when_papers_present(tmp_path, capsys):
    db = tmp_path / "scientific_litter_scoop.db"
    main(["init", "--db-path", str(db)])
    capsys.readouterr()
    # Insert a paper row to simulate real user data.
    import sqlite3
    c = sqlite3.connect(db)
    try:
        c.execute(
            "INSERT INTO papers (id, title, authors, year) VALUES (?, ?, ?, ?)",
            ("test/0001", "T", "A", 2026),
        )
        c.commit()
    finally:
        c.close()
    rc = main(["init", "--db-path", str(db)])
    err = capsys.readouterr().err
    assert rc == 1
    assert "already contains" in err
    # DB untouched
    c = sqlite3.connect(db)
    try:
        n = c.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
    finally:
        c.close()
    assert n == 1


def test_init_force_overwrites_populated_db(tmp_path, capsys):
    db = tmp_path / "scientific_litter_scoop.db"
    main(["init", "--db-path", str(db)])
    capsys.readouterr()
    import sqlite3
    c = sqlite3.connect(db)
    try:
        c.execute(
            "INSERT INTO papers (id, title, authors, year) VALUES (?, ?, ?, ?)",
            ("test/0001", "T", "A", 2026),
        )
        c.commit()
    finally:
        c.close()
    rc = main(["init", "--force", "--db-path", str(db)])
    out = capsys.readouterr().out
    assert rc == 0
    assert "removed existing" in out
    c = sqlite3.connect(db)
    try:
        n = c.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
    finally:
        c.close()
    assert n == 0


def test_init_creates_parent_directory(tmp_path, capsys):
    db = tmp_path / "nested" / "subdir" / "scientific_litter_scoop.db"
    rc = main(["init", "--db-path", str(db)])
    capsys.readouterr()
    assert rc == 0
    assert db.exists()


def test_init_rejects_non_sqlite_file(tmp_path, capsys):
    db = tmp_path / "junk.db"
    db.write_bytes(b"this is definitely not a sqlite file " * 100)
    rc = main(["init", "--db-path", str(db)])
    err = capsys.readouterr().err
    assert rc == 1
    assert "not a valid SQLite" in err


# ─── plan #12: passthrough subcommands ───


def test_process_subcommand_dispatches_to_module(monkeypatch, capsys):
    """`scq process X` should route to scq.ingest.process.main with `process` not in argv."""
    called_with = []
    def fake_main():
        called_with.append(list(__import__('sys').argv))
    monkeypatch.setattr("scq.ingest.process.main", fake_main)
    rc = main(["process", "2401.12345", "--note", "x"])
    assert rc == 0
    # The fake saw argv = ["scq process", "2401.12345", "--note", "x"]
    assert called_with[0][1:] == ["2401.12345", "--note", "x"]


def test_merge_subcommand_dispatches_to_module(monkeypatch):
    received = []
    def fake_main(argv):
        received.append(list(argv))
        return 0
    monkeypatch.setattr("scq.db.merge.main", fake_main)
    rc = main(["merge", "merge", "src.db", "dst.db", "--dry-run"])
    assert rc == 0
    assert received[0] == ["merge", "src.db", "dst.db", "--dry-run"]


def test_init_db_subcommand_with_options(monkeypatch):
    """init-db --stats should pass through cleanly even though `--stats` is option-shaped."""
    received = []
    def fake_main(argv):
        received.append(list(argv))
        return 0
    monkeypatch.setattr("scq.db.init.main", fake_main)
    rc = main(["init-db", "--stats"])
    assert rc == 0
    assert received[0] == ["--stats"]


def test_passthrough_appears_in_help(capsys):
    rc = main([])
    out = capsys.readouterr().out
    assert "process" in out
    assert "merge" in out
    assert "init-db" in out
    assert rc == 1


def test_top_level_init_still_works_after_passthrough_added(tmp_path, capsys):
    """Regression: the original `scq init --db-path X` (no passthrough) still works."""
    db = tmp_path / "fresh.db"
    rc = main(["init", "--db-path", str(db)])
    assert rc == 0
    assert db.exists()
