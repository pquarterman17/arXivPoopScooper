"""Tests for scq.config.portable (plan #22)."""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scq.config import portable  # noqa: E402


@pytest.fixture
def fake_repo(monkeypatch, tmp_path):
    """Build a tmp_path repo with user_config/ + populate a few domains."""
    user_dir = tmp_path / "data" / "user_config"
    user_dir.mkdir(parents=True)
    (user_dir / "digest.json").write_text(json.dumps({"maxPapers": 25}), encoding="utf-8")
    (user_dir / "ui.json").write_text(json.dumps({"theme": "dark"}), encoding="utf-8")
    (user_dir / "paths.toml").write_text('db_path = "/tmp/test.db"\n', encoding="utf-8")
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    yield tmp_path
    _paths_refresh()


# ─── export ───


def test_export_writes_zip_with_user_config_files(fake_repo, tmp_path):
    out = tmp_path / "bundle.zip"
    manifest = portable.export_config(out)
    assert out.is_file()
    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
    assert "user_config/digest.json" in names
    assert "user_config/ui.json" in names
    assert "MANIFEST.json" in names
    assert manifest["version"] == portable.MANIFEST_VERSION
    assert "user_config/digest.json" in manifest["contents"]


def test_export_skips_paths_by_default(fake_repo, tmp_path):
    out = tmp_path / "bundle.zip"
    portable.export_config(out)
    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
    assert "user_config/paths.toml" not in names


def test_export_includes_paths_when_opted_in(fake_repo, tmp_path):
    out = tmp_path / "bundle.zip"
    manifest = portable.export_config(out, include_paths=True)
    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
    assert "user_config/paths.toml" in names
    assert manifest["includesPaths"] is True


def test_export_excludes_secrets_in_manifest(fake_repo, tmp_path):
    manifest = portable.export_config(tmp_path / "bundle.zip")
    excluded = " ".join(manifest["excluded"])
    assert "secret" in excluded.lower()


def test_export_skips_missing_domains(fake_repo, tmp_path):
    """If user has only some domains configured, those alone get bundled."""
    manifest = portable.export_config(tmp_path / "bundle.zip")
    assert "user_config/digest.json" in manifest["contents"]
    assert "user_config/citations.json" not in manifest["contents"]
    assert "user_config/email.json" not in manifest["contents"]


def test_export_overwrites_existing_zip(fake_repo, tmp_path):
    out = tmp_path / "bundle.zip"
    out.write_bytes(b"junk")
    portable.export_config(out)
    # Should now be a real zip
    with zipfile.ZipFile(out) as zf:
        assert "MANIFEST.json" in zf.namelist()


def test_export_raises_when_user_config_dir_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        with pytest.raises(FileNotFoundError, match="user_config"):
            portable.export_config(tmp_path / "bundle.zip")
    finally:
        _paths_refresh()


# ─── import ───


@pytest.fixture
def bundled_zip(fake_repo, tmp_path):
    out = tmp_path / "bundle.zip"
    portable.export_config(out, include_paths=True)
    return out


def test_import_extracts_files_to_user_config(monkeypatch, tmp_path, bundled_zip):
    """Round-trip: export from one repo, import into a fresh one."""
    fresh = tmp_path / "fresh"
    fresh.mkdir()
    (fresh / "data" / "user_config").mkdir(parents=True)
    monkeypatch.setenv("SCQ_REPO_ROOT", str(fresh))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        result = portable.import_config(bundled_zip)
        assert "digest.json" in result["written"]
        assert (fresh / "data" / "user_config" / "digest.json").is_file()
    finally:
        _paths_refresh()


def test_import_skips_existing_files_by_default(monkeypatch, tmp_path, bundled_zip):
    fresh = tmp_path / "fresh"
    user_dir = fresh / "data" / "user_config"
    user_dir.mkdir(parents=True)
    (user_dir / "digest.json").write_text('{"maxPapers": 999}', encoding="utf-8")
    monkeypatch.setenv("SCQ_REPO_ROOT", str(fresh))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        result = portable.import_config(bundled_zip)
        assert "digest.json" in result["skipped"]
        # Existing file unchanged
        on_disk = json.loads((user_dir / "digest.json").read_text())
        assert on_disk == {"maxPapers": 999}
    finally:
        _paths_refresh()


def test_import_overwrite_replaces_existing(monkeypatch, tmp_path, bundled_zip):
    fresh = tmp_path / "fresh"
    user_dir = fresh / "data" / "user_config"
    user_dir.mkdir(parents=True)
    (user_dir / "digest.json").write_text('{"maxPapers": 999}', encoding="utf-8")
    monkeypatch.setenv("SCQ_REPO_ROOT", str(fresh))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        result = portable.import_config(bundled_zip, overwrite=True)
        assert "digest.json" in result["written"]
        # Was 25 in the bundle; should now be 25 on disk
        on_disk = json.loads((user_dir / "digest.json").read_text())
        assert on_disk == {"maxPapers": 25}
    finally:
        _paths_refresh()


def test_import_rejects_unsupported_version(monkeypatch, tmp_path):
    bad = tmp_path / "bad.zip"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr("MANIFEST.json", json.dumps({"version": 99}))
    fresh = tmp_path / "fresh"
    (fresh / "data" / "user_config").mkdir(parents=True)
    monkeypatch.setenv("SCQ_REPO_ROOT", str(fresh))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        with pytest.raises(ValueError, match="version"):
            portable.import_config(bad)
    finally:
        _paths_refresh()


def test_import_rejects_symlink_entry(monkeypatch, tmp_path):
    """Bug-hunter #5: a Unix symlink entry inside the bundle can redirect
    a config write to an arbitrary path. Reject before extraction."""
    evil = tmp_path / "evil.zip"
    with zipfile.ZipFile(evil, "w") as zf:
        zf.writestr("MANIFEST.json", json.dumps({"version": portable.MANIFEST_VERSION}))
        # Build a ZipInfo entry with the symlink mode bit set in
        # external_attr (Unix S_IFLNK = 0o120000 in upper 16 bits).
        info = zipfile.ZipInfo("user_config/digest.json")
        info.external_attr = (0o120777 << 16)
        zf.writestr(info, "/etc/passwd")
    fresh = tmp_path / "fresh"
    (fresh / "data" / "user_config").mkdir(parents=True)
    monkeypatch.setenv("SCQ_REPO_ROOT", str(fresh))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        with pytest.raises(ValueError, match="symlink"):
            portable.import_config(evil)
        # No file was extracted
        assert not (fresh / "data" / "user_config" / "digest.json").exists()
    finally:
        _paths_refresh()


def test_import_rejects_zip_slip_path_traversal(monkeypatch, tmp_path):
    """An attacker-crafted bundle with a `..` segment should be rejected."""
    evil = tmp_path / "evil.zip"
    with zipfile.ZipFile(evil, "w") as zf:
        zf.writestr("MANIFEST.json", json.dumps({"version": portable.MANIFEST_VERSION}))
        zf.writestr("user_config/../escaped.json", '{"x": 1}')
    fresh = tmp_path / "fresh"
    (fresh / "data" / "user_config").mkdir(parents=True)
    monkeypatch.setenv("SCQ_REPO_ROOT", str(fresh))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        with pytest.raises(ValueError, match="unsafe path"):
            portable.import_config(evil)
    finally:
        _paths_refresh()


def test_import_raises_when_zip_missing(fake_repo, tmp_path):
    with pytest.raises(FileNotFoundError):
        portable.import_config(tmp_path / "nope.zip")


# ─── CLI integration ───


def test_cli_export_dispatches(fake_repo, tmp_path, capsys):
    """`scq config export <path>` should reach scq.config.portable.export_config."""
    out = tmp_path / "bundle.zip"
    from scq.cli import main as cli_main
    rc = cli_main(["config", "export", str(out)])
    assert rc == 0
    assert out.is_file()
    assert "wrote" in capsys.readouterr().out


def test_cli_import_dispatches(monkeypatch, tmp_path, fake_repo, capsys):
    out = tmp_path / "bundle.zip"
    portable.export_config(out)

    fresh = tmp_path / "fresh"
    (fresh / "data" / "user_config").mkdir(parents=True)
    monkeypatch.setenv("SCQ_REPO_ROOT", str(fresh))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    try:
        from scq.cli import main as cli_main
        rc = cli_main(["config", "import", str(out)])
        assert rc == 0
        assert "installed" in capsys.readouterr().out
        assert (fresh / "data" / "user_config" / "digest.json").is_file()
    finally:
        _paths_refresh()
