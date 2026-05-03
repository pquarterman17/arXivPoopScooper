"""Integration tests for serve.py's POST /api/secret endpoint
(plan #11 — secrets management UI).

The endpoint writes to the OS keyring via scq.config.secrets.set. CI
runners and most test environments don't have a keyring backend, so we
monkeypatch scq.config.secrets at the module level.
"""

from __future__ import annotations

import contextlib
import http.server
import json
import socket
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scq import server as serve  # noqa: E402
from scq.config import secrets as secrets_mod  # noqa: E402


def _free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(autouse=True)
def _block_browser_and_console(monkeypatch):
    import webbrowser
    monkeypatch.setattr(webbrowser, "open", lambda *_a, **_k: None)
    monkeypatch.setattr(webbrowser, "open_new_tab", lambda *_a, **_k: None)
    monkeypatch.setattr(serve, "_ensure_console", lambda: None)


@pytest.fixture
def fake_keyring(monkeypatch):
    """Replace secrets.set with an in-memory recorder so the endpoint
    can be exercised without an actual keyring backend."""
    written = {}
    def fake_set(name, value):
        if not isinstance(name, str) or not name:
            raise ValueError("bad name")
        if not isinstance(value, str):
            raise ValueError("bad value")
        written[name] = value
    monkeypatch.setattr(secrets_mod, "set", fake_set)
    return written


@pytest.fixture
def running_server(fake_keyring):
    port = _free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), serve.SCQHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield port, fake_keyring
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def _post(port, path, payload, *, raw=None):
    body = raw if raw is not None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_post_secret_writes_to_keyring(running_server):
    port, written = running_server
    status, body = _post(port, "/api/secret", {"name": "email_app_password", "value": "abcd-efgh"})
    assert status == 200
    assert body == {"ok": True, "name": "email_app_password"}
    assert written == {"email_app_password": "abcd-efgh"}


def test_post_secret_rejects_unknown_name(running_server):
    port, written = running_server
    status, body = _post(port, "/api/secret", {"name": "rogue_token", "value": "x"})
    assert status == 400
    assert body["ok"] is False
    assert "allowlist" in body["error"].lower()
    assert written == {}


def test_post_secret_rejects_missing_name(running_server):
    port, _ = running_server
    status, body = _post(port, "/api/secret", {"value": "x"})
    assert status == 400
    assert body["ok"] is False
    assert "name" in body["error"].lower()


def test_post_secret_rejects_non_string_value(running_server):
    port, _ = running_server
    status, body = _post(port, "/api/secret", {"name": "email_app_password", "value": 12345})
    assert status == 400
    assert body["ok"] is False
    assert "value" in body["error"].lower()


def test_post_secret_rejects_empty_body(running_server):
    port, _ = running_server
    status, body = _post(port, "/api/secret", None, raw=b"")
    assert status == 400
    assert "Empty" in body["error"]


def test_post_secret_rejects_invalid_json(running_server):
    port, _ = running_server
    status, body = _post(port, "/api/secret", None, raw=b"not json{")
    assert status == 400
    assert "Invalid JSON" in body["error"]


def test_post_secret_rejects_oversized_body(running_server):
    port, _ = running_server
    huge = b'{"name":"email_app_password","value":"' + b"x" * 5000 + b'"}'
    status, body = _post(port, "/api/secret", None, raw=huge)
    assert status == 413


def test_post_secret_returns_503_when_keyring_unavailable(running_server, monkeypatch):
    port, _ = running_server
    def raises(*_a, **_k):
        raise secrets_mod.KeyringUnavailable()
    monkeypatch.setattr(secrets_mod, "set", raises)
    status, body = _post(port, "/api/secret", {"name": "email_app_password", "value": "x"})
    assert status == 503
    assert body["ok"] is False
    assert "keyring" in body["error"].lower()


def test_post_secret_accepts_empty_value_string(running_server):
    """Empty string is a valid value (effectively "set to nothing")."""
    port, written = running_server
    status, body = _post(port, "/api/secret", {"name": "email_app_password", "value": ""})
    assert status == 200
    assert written["email_app_password"] == ""


def test_get_secret_returns_404(running_server):
    """No GET endpoint by design — secrets must never be served back."""
    port, _ = running_server
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/secret", timeout=5) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    assert status == 404


def test_env_truthy_handles_falsy_strings():
    """Bug-hunter #2: SCQ_NO_BROWSER=false must NOT suppress the browser.
    Plain `if os.environ.get(...)` would have flipped that into 'skip'."""
    truthy = serve._env_truthy
    assert truthy(None) is False
    assert truthy("") is False
    assert truthy("   ") is False
    # Falsy strings — the bug case
    assert truthy("0") is False
    assert truthy("false") is False
    assert truthy("FALSE") is False
    assert truthy("no") is False
    assert truthy("Off") is False
    # Truthy strings
    assert truthy("1") is True
    assert truthy("true") is True
    assert truthy("yes") is True
    assert truthy("anything-else") is True


def test_unknown_post_path_still_returns_404(running_server):
    """Sanity: the new endpoint didn't accidentally swallow the catch-all 404."""
    port, _ = running_server
    body = json.dumps({"x": 1}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/not-a-thing", data=body, method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    assert status == 404
