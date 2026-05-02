"""Integration tests for serve.py's /api/config/<domain> GET + POST endpoints
(plan #11 — schema-driven Settings UI).

Spins up SCQHandler in-process (ThreadingHTTPServer), exercises the GET +
POST flow for a representative domain (`citations`) and the special-case
`paths` domain (TOML write). Asserts validation errors, atomic writes,
and that paths.refresh() invalidates the resolver cache.
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

import serve  # noqa: E402


def _free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(autouse=True)
def _block_browser_and_console_relaunch(monkeypatch):
    """Defense in depth: never let serve.py open a browser or relaunch console
    from a test (matches the convention in test_save_db_endpoint.py)."""
    import webbrowser
    def _no_browser(*_a, **_kw):
        raise AssertionError("test attempted to open a browser tab")
    monkeypatch.setattr(webbrowser, "open", _no_browser)
    monkeypatch.setattr(webbrowser, "open_new_tab", _no_browser)
    monkeypatch.setattr(serve, "_ensure_console", lambda: None)


@pytest.fixture
def running_server(tmp_path, monkeypatch):
    """Start the server with cwd pointing at an isolated tmp_path layout that
    mimics the repo (data/, src/config/...). The handler resolves files
    relative to cwd, so we copy in just enough scaffolding."""
    repo = Path(__file__).resolve().parents[1]
    # Create a temp repo skeleton
    (tmp_path / "data" / "user_config").mkdir(parents=True)
    (tmp_path / "src" / "config" / "schema").mkdir(parents=True)
    (tmp_path / "src" / "config" / "defaults").mkdir(parents=True)
    # Symlink/copy the schemas + defaults from the real repo so validation works
    import shutil
    for f in (repo / "src" / "config" / "schema").iterdir():
        shutil.copy2(f, tmp_path / "src" / "config" / "schema" / f.name)
    for f in (repo / "src" / "config" / "defaults").iterdir():
        shutil.copy2(f, tmp_path / "src" / "config" / "defaults" / f.name)
    # Copy pyproject.toml so paths.py's repo_root() walk-up succeeds
    shutil.copy2(repo / "pyproject.toml", tmp_path / "pyproject.toml")

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    # Force paths resolver to re-read SCQ_REPO_ROOT
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


def _get(port, path):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _post(port, path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# ─── GET /api/config/<domain> ───


def test_get_returns_default_for_unedited_domain(running_server):
    port, _ = running_server
    status, body = _get(port, "/api/config/citations")
    assert status == 200, body
    payload = json.loads(body)
    # Per the shipped citations defaults
    assert "defaultStyle" in payload


def test_get_unknown_domain_returns_404(running_server):
    port, _ = running_server
    status, _ = _get(port, "/api/config/not-a-domain")
    assert status == 404


def test_get_paths_returns_resolved_locations(running_server):
    port, _ = running_server
    status, body = _get(port, "/api/config/paths")
    assert status == 200
    payload = json.loads(body)
    # All 8 expected fields present
    expected = {
        "db_path", "papers_dir", "figures_dir", "inbox_dir",
        "exports_dir", "digests_dir",
        "references_bib_path", "references_txt_path",
    }
    assert set(payload.keys()) == expected


# ─── POST /api/config/<domain> — JSON domains ───


def test_post_writes_user_config_file(running_server):
    port, root = running_server
    payload = {"defaultStyle": "apa", "includeDoi": False, "includeArxivId": True, "includeUrl": False, "abbreviateJournals": False}
    status, body = _post(port, "/api/config/citations", payload)
    assert status == 200, body
    target = root / "data" / "user_config" / "citations.json"
    assert target.is_file()
    on_disk = json.loads(target.read_text(encoding="utf-8"))
    assert on_disk["defaultStyle"] == "apa"


def test_post_validation_failure_returns_400(running_server):
    port, root = running_server
    # `defaultStyle` is an enum; "bogus" is invalid
    payload = {"defaultStyle": "bogus"}
    status, body = _post(port, "/api/config/citations", payload)
    assert status == 400
    err = json.loads(body)
    assert "errors" in err
    assert len(err["errors"]) >= 1
    # No file written
    assert not (root / "data" / "user_config" / "citations.json").exists()


def test_post_unknown_domain_returns_404(running_server):
    port, _ = running_server
    status, _ = _post(port, "/api/config/not-a-domain", {})
    assert status == 404


def test_post_invalid_json_returns_400(running_server):
    port, _ = running_server
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/config/citations",
        data=b"{not valid json}",
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=5)
        assert False, "should have raised"
    except urllib.error.HTTPError as e:
        assert e.code == 400


# ─── POST /api/config/paths — TOML special case ───


def test_post_paths_writes_toml_with_literal_strings(running_server):
    port, root = running_server
    payload = {
        "db_path": r"C:\OneDrive\db.sqlite",
        "papers_dir": r"C:\OneDrive\papers",
        "figures_dir": r"C:\OneDrive\figures",
        "inbox_dir": r"C:\OneDrive\inbox",
        "exports_dir": r"C:\OneDrive\exports",
        "digests_dir": r"C:\OneDrive\digests",
        "references_bib_path": r"C:\OneDrive\refs.bib",
        "references_txt_path": r"C:\OneDrive\refs.txt",
    }
    status, body = _post(port, "/api/config/paths", payload)
    assert status == 200, body
    toml_path = root / "data" / "user_config" / "paths.toml"
    assert toml_path.is_file()
    content = toml_path.read_text(encoding="utf-8")
    # Single-quoted literal string preserves backslashes
    assert "db_path = 'C:\\OneDrive\\db.sqlite'" in content
    # Verify TOML is parseable + round-trips
    try:
        import tomllib
    except ImportError:
        import tomli as tomllib  # type: ignore[no-redef]
    parsed = tomllib.loads(content)
    assert parsed["db_path"] == r"C:\OneDrive\db.sqlite"


def test_post_paths_validation_failure_returns_400(running_server):
    port, _ = running_server
    # Missing required fields
    status, body = _post(port, "/api/config/paths", {"db_path": "/tmp/x.db"})
    assert status == 400
    err = json.loads(body)
    assert "errors" in err and len(err["errors"]) >= 1


def test_post_paths_invalidates_resolver_cache(running_server):
    """After POST, the next GET should reflect the new values — proves
    paths.refresh() is called server-side."""
    port, root = running_server
    payload = {
        "db_path": str(root / "alt" / "altdb.sqlite"),
        "papers_dir": str(root / "alt" / "papers"),
        "figures_dir": str(root / "alt" / "figures"),
        "inbox_dir": str(root / "alt" / "inbox"),
        "exports_dir": str(root / "alt" / "exports"),
        "digests_dir": str(root / "alt" / "digests"),
        "references_bib_path": str(root / "alt" / "refs.bib"),
        "references_txt_path": str(root / "alt" / "refs.txt"),
    }
    _post(port, "/api/config/paths", payload)
    status, body = _get(port, "/api/config/paths")
    assert status == 200
    after = json.loads(body)
    assert "altdb.sqlite" in after["db_path"]


def test_post_no_temp_files_leaked(running_server):
    port, root = running_server
    payload = {"defaultStyle": "prl", "includeDoi": True, "includeArxivId": True, "includeUrl": False, "abbreviateJournals": False}
    _post(port, "/api/config/citations", payload)
    leftovers = list((root / "data" / "user_config").glob(".scq_write_*"))
    assert leftovers == [], f"temp files leaked: {leftovers}"
