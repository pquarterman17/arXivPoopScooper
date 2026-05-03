"""Config import/export — bundle ``data/user_config/*`` into a portable
zip so users can transfer their setup between machines (plan #22).

What's in the zip:

  - ``user_config/digest.json``, ``citations.json``, ``ui.json``,
    ``ingest.json``, ``email.json``, ``watchlist.json``, ``privacy.json``,
    ``search-sources.json``, ``auto-tag-rules.json`` — whichever exist
  - ``user_config/paths.toml`` — only when ``include_paths=True``
    (paths are machine-specific by default; opt in for clones)
  - ``MANIFEST.json`` — schema version, exported-at timestamp, list of
    contained files

What's NEVER in the zip:

  - Secrets (SMTP password, API tokens). Those live in the OS keyring;
    re-set with ``scq config set-secret`` on the destination machine.
  - The .db file. Configs are knobs, not data.
  - ``.example`` template files. They ship in the repo.

Format choice: a flat ``.zip`` of JSON/TOML files. Plain enough that a
user can crack it open with `unzip -l` to see what's about to land
without trusting our import code.
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from .paths import paths

MANIFEST_VERSION = 1
PORTABLE_DOMAINS = (
    "digest", "citations", "ui", "ingest", "email", "watchlist", "privacy",
    "search-sources", "auto-tag-rules",
)


def export_config(zip_path: Path | str, *, include_paths: bool = False) -> dict:
    """Bundle the user_config directory into ``zip_path``.

    Returns a manifest dict (also written into the zip). ``zip_path`` is
    overwritten if it exists. Missing user_config files are silently
    skipped — the user's setup may legitimately rely on defaults for some
    domains.

    ``include_paths=True`` adds ``paths.toml`` to the bundle. Off by
    default because db_path / inbox_dir / etc. tend to be machine-local.
    """
    zip_path = Path(zip_path)
    user_dir = paths().repo_root / "data" / "user_config"
    if not user_dir.is_dir():
        raise FileNotFoundError(f"user_config dir not found: {user_dir}")

    contents = []
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for domain in PORTABLE_DOMAINS:
            src = user_dir / f"{domain}.json"
            if not src.is_file():
                continue
            zf.write(src, arcname=f"user_config/{domain}.json")
            contents.append(f"user_config/{domain}.json")
        if include_paths:
            paths_toml = user_dir / "paths.toml"
            if paths_toml.is_file():
                zf.write(paths_toml, arcname="user_config/paths.toml")
                contents.append("user_config/paths.toml")

        manifest = {
            "version": MANIFEST_VERSION,
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "includesPaths": include_paths,
            "contents": contents,
            # Secrets are intentionally never bundled. Document so the
            # user knows to re-set them on the destination machine.
            "excluded": ["secrets (run scq config set-secret on the new machine)"],
        }
        zf.writestr("MANIFEST.json", json.dumps(manifest, indent=2) + "\n")

    zip_path.parent.mkdir(parents=True, exist_ok=True)
    zip_path.write_bytes(buf.getvalue())
    return manifest


def import_config(zip_path: Path | str, *, overwrite: bool = False) -> dict:
    """Extract a config bundle into ``data/user_config/``.

    By default refuses to overwrite existing user_config files (the user
    probably doesn't want their carefully-curated digest.json silently
    replaced). Pass ``overwrite=True`` to clobber.

    Returns a dict ``{written: [...], skipped: [...], manifest: {...}}``.
    """
    zip_path = Path(zip_path)
    if not zip_path.is_file():
        raise FileNotFoundError(f"config bundle not found: {zip_path}")

    user_dir = paths().repo_root / "data" / "user_config"
    user_dir.mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    skipped: list[str] = []
    manifest: dict = {}

    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
        if "MANIFEST.json" in names:
            with zf.open("MANIFEST.json") as f:
                manifest = json.loads(f.read().decode("utf-8"))
            if manifest.get("version") != MANIFEST_VERSION:
                raise ValueError(
                    f"unsupported bundle version {manifest.get('version')!r} "
                    f"(this scq supports version {MANIFEST_VERSION})"
                )

        for name in names:
            if not name.startswith("user_config/"):
                continue
            # Defense against zip-slip: reject any path with `..` segments
            # or absolute paths. zipfile already rejects absolute on POSIX
            # but we belt-and-suspender it here.
            rel = Path(name)
            if rel.is_absolute() or ".." in rel.parts:
                raise ValueError(f"refusing unsafe path in bundle: {name}")
            target = user_dir / rel.name  # flatten one level
            if target.exists() and not overwrite:
                skipped.append(rel.name)
                continue
            with zf.open(name) as src:
                target.write_bytes(src.read())
            written.append(rel.name)

    return {"written": sorted(written), "skipped": sorted(skipped), "manifest": manifest}
