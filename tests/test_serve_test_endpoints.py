"""Integration tests for the Settings UI's three test-button endpoints
(`/api/test/db-path`, `/api/test/smtp`, `/api/test/digest`).

The DB-path test exercises a real SQLite file. The SMTP + digest tests
monkeypatch ``smtplib.SMTP_SSL`` so they don't actually open a network
connection — the goal is to verify the request → handler wiring,
config loading, and JSON shape, not to validate credentials end-to-end
(which is what the buttons do at runtime against real services).
"""

from __future__ import annotations

import contextlib
import http.server
import json
import shutil
import socket
import sqlite3
import sys
import threading
import urllib.request
import urllib.error
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import serve  # noqa: E402


def _free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(autouse=True)
def _block_browser(monkeypatch):
    import webbrowser
    def _no_browser(*_a, **_kw):
        raise AssertionError("test attempted to open a browser tab")
    monkeypatch.setattr(webbrowser, "open", _no_browser)
    monkeypatch.setattr(webbrowser, "open_new_tab", _no_browser)
    monkeypatch.setattr(serve, "_ensure_console", lambda: None)


@pytest.fixture
def running_server(tmp_path, monkeypatch):
    """Server with an isolated SCQ_REPO_ROOT pointing at tmp_path that
    mimics the real repo layout (config dirs + pyproject.toml)."""
    repo = Path(__file__).resolve().parents[1]
    (tmp_path / "data" / "user_config").mkdir(parents=True)
    (tmp_path / "data" / "migrations").mkdir(parents=True)
    (tmp_path / "src" / "config" / "schema").mkdir(parents=True)
    (tmp_path / "src" / "config" / "defaults").mkdir(parents=True)
    for f in (repo / "src" / "config" / "schema").iterdir():
        shutil.copy2(f, tmp_path / "src" / "config" / "schema" / f.name)
    for f in (repo / "src" / "config" / "defaults").iterdir():
        shutil.copy2(f, tmp_path / "src" / "config" / "defaults" / f.name)
    for f in (repo / "data" / "migrations").iterdir():
        shutil.copy2(f, tmp_path / "data" / "migrations" / f.name)
    shutil.copy2(repo / "pyproject.toml", tmp_path / "pyproject.toml")

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()

    port = _free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), serve.SCQHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield port, tmp_path
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def _post(port, path, body=b""):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=body, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# ─── /api/test/db-path ───


def test_db_path_returns_ok_for_real_sqlite_file(running_server):
    port, root = running_server
    db = root / "data" / "scientific_litter_scoop.db"
    db.parent.mkdir(parents=True, exist_ok=True)
    # Apply migrations so the DB has the `papers` table
    from scq.db.migrations import apply_pending
    conn = sqlite3.connect(db)
    try:
        apply_pending(conn)
        conn.execute(
            "INSERT INTO papers (id, title, authors, year) VALUES (?, ?, ?, ?)",
            ("test/0001", "T", "A", 2026),
        )
        conn.commit()
    finally:
        conn.close()

    status, body = _post(port, "/api/test/db-path")
    assert status == 200
    payload = json.loads(body)
    assert payload["ok"] is True, payload
    assert payload["path"].endswith("scientific_litter_scoop.db")
    assert payload["size"] > 0
    assert payload["papers"] == 1


def test_db_path_returns_error_when_file_missing(running_server):
    port, _ = running_server
    status, body = _post(port, "/api/test/db-path")
    assert status == 200
    payload = json.loads(body)
    assert payload["ok"] is False
    assert "not found" in payload["error"].lower()


def test_db_path_returns_error_for_non_sqlite_file(running_server):
    port, root = running_server
    db = root / "data" / "scientific_litter_scoop.db"
    db.parent.mkdir(parents=True, exist_ok=True)
    db.write_bytes(b"not a sqlite file at all")
    status, body = _post(port, "/api/test/db-path")
    assert status == 200
    payload = json.loads(body)
    assert payload["ok"] is False


# ─── /api/test/smtp (SMTP_SSL monkeypatched) ───


class _FakeSMTP:
    """Stand-in for smtplib.SMTP_SSL that records calls and never opens a socket."""
    def __init__(self, *, raise_on_login=None, recorder=None):
        self._raise = raise_on_login
        self._rec = recorder if recorder is not None else []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def login(self, user, password):
        self._rec.append(("login", user, password))
        if self._raise:
            raise self._raise

    def send_message(self, msg):
        self._rec.append(("send", msg["To"], msg["Subject"]))


def _patch_smtp_ssl(monkeypatch, recorder=None, raise_on_login=None):
    import smtplib
    def factory(host, port, *a, **kw):
        rec = recorder if recorder is not None else []
        rec.append(("connect", host, port))
        return _FakeSMTP(raise_on_login=raise_on_login, recorder=rec)
    monkeypatch.setattr(smtplib, "SMTP_SSL", factory)


def test_smtp_ok_with_credentials(running_server, monkeypatch):
    port, _ = running_server
    rec = []
    _patch_smtp_ssl(monkeypatch, recorder=rec)
    monkeypatch.setenv("SCQ_EMAIL_FROM", "me@example.com")
    monkeypatch.setenv("SCQ_EMAIL_APP_PASSWORD", "pw1234")

    status, body = _post(port, "/api/test/smtp")
    payload = json.loads(body)
    assert status == 200
    assert payload["ok"] is True, payload
    assert payload["from"] == "me@example.com"
    assert payload["host"] == "smtp.gmail.com"
    assert payload["port"] == 465
    # Recorder shows the handler dialed connect + login
    assert ("connect", "smtp.gmail.com", 465) in rec
    assert any(c[0] == "login" and c[1] == "me@example.com" for c in rec)


def test_smtp_missing_password_returns_error(running_server, monkeypatch):
    port, _ = running_server
    monkeypatch.setenv("SCQ_EMAIL_FROM", "me@example.com")
    monkeypatch.delenv("SCQ_EMAIL_APP_PASSWORD", raising=False)
    # also force secrets.get to return None
    from scq.config import secrets as _secrets_mod
    monkeypatch.setattr(_secrets_mod, "get", lambda *_a, **_kw: None)

    status, body = _post(port, "/api/test/smtp")
    payload = json.loads(body)
    assert status == 200
    assert payload["ok"] is False
    assert "password" in payload["error"].lower()


def test_smtp_missing_from_returns_error(running_server, monkeypatch):
    port, _ = running_server
    monkeypatch.delenv("SCQ_EMAIL_FROM", raising=False)
    monkeypatch.setenv("SCQ_EMAIL_APP_PASSWORD", "pw1234")
    status, body = _post(port, "/api/test/smtp")
    payload = json.loads(body)
    assert status == 200
    assert payload["ok"] is False
    assert "from_address" in payload["error"]


def test_smtp_auth_failure_surfaces_error(running_server, monkeypatch):
    import smtplib
    port, _ = running_server
    monkeypatch.setenv("SCQ_EMAIL_FROM", "me@example.com")
    monkeypatch.setenv("SCQ_EMAIL_APP_PASSWORD", "wrong")
    err = smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted")
    _patch_smtp_ssl(monkeypatch, raise_on_login=err)

    status, body = _post(port, "/api/test/smtp")
    payload = json.loads(body)
    assert status == 200
    assert payload["ok"] is False
    assert "535" in payload["error"]


# ─── /api/test/digest ───


def test_digest_sends_to_recipients_when_configured(running_server, monkeypatch):
    port, root = running_server
    monkeypatch.setenv("SCQ_EMAIL_FROM", "me@example.com")
    monkeypatch.setenv("SCQ_EMAIL_APP_PASSWORD", "pw1234")
    # Provide a digest config with active recipients
    digest_cfg = {
        "cadence": "daily",
        "maxPapers": 10,
        "recipients": [
            {"email": "alice@x.com", "active": True},
            {"email": "bob@x.com", "active": False},  # disabled — should be skipped
            {"email": "alice@x.com", "active": True},  # dedup
        ],
    }
    (root / "data" / "user_config" / "digest.json").write_text(
        json.dumps(digest_cfg), encoding="utf-8"
    )
    rec = []
    _patch_smtp_ssl(monkeypatch, recorder=rec)

    status, body = _post(port, "/api/test/digest")
    payload = json.loads(body)
    assert status == 200, payload
    assert payload["ok"] is True, payload
    # Only alice@x.com (active + deduped); bob@x.com excluded because inactive
    assert payload["recipients"] == ["alice@x.com"]
    # The fake SMTP recorded a connect → login → send sequence
    assert any(c[0] == "send" for c in rec)


def test_digest_no_recipients_returns_error(running_server, monkeypatch):
    port, root = running_server
    monkeypatch.setenv("SCQ_EMAIL_FROM", "me@example.com")
    monkeypatch.setenv("SCQ_EMAIL_APP_PASSWORD", "pw1234")
    (root / "data" / "user_config" / "digest.json").write_text(
        json.dumps({"cadence": "daily", "maxPapers": 10, "recipients": []}),
        encoding="utf-8",
    )
    status, body = _post(port, "/api/test/digest")
    payload = json.loads(body)
    assert status == 200
    assert payload["ok"] is False
    assert "recipient" in payload["error"].lower()


def test_digest_normalize_helper_handles_string_format(monkeypatch):
    """Lower-level: serve._normalize_recipients accepts bare strings even
    though the digest schema now requires objects. Keeps the helper
    forward/backward compatible for any other caller passing raw lists."""
    out = serve._normalize_recipients(["a@x.com", "b@x.com", "a@x.com"])
    assert out == ["a@x.com", "b@x.com"]  # dedup preserved
    out = serve._normalize_recipients([
        {"email": "x@x.com", "active": False},
        {"email": "y@x.com"},  # active defaults to True
    ])
    assert out == ["y@x.com"]
