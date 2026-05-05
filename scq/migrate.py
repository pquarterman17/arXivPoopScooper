"""One-shot migration from the legacy ``scraper_config.js`` layout into
the new ``data/user_config/*.json`` shape (plan #23).

The legacy file is a JS source that defines a ``SCRAPER_CONFIG`` object
literal containing sources, presets, arxivCategories, autoFetch, tags
(auto-tag rules), entryTypes, and a ``formatBibTeX`` function. The new
config system splits this across two domains:

  - ``user_config/search-sources.json`` — sources, presets,
    arxivCategories, autoFetch
  - ``user_config/auto-tag-rules.json`` — ``rules`` array derived from
    the legacy ``tags`` map

``entryTypes`` and ``formatBibTeX`` aren't ported — entryTypes still
ships in scraper_config.js (the JS apps read it from there), and the
citation formatter is now a JS service.

Why this is a Python tool: easier to install than asking users to run a
Node helper. The JS file is parsed by spawning ``node -e`` with an eval
+ JSON.stringify shim — Node is already a project dep (the arXiv fetch
script lives in tools/fetch_arxiv.js), so the dependency is acceptable.
If Node isn't on PATH, the tool prints a manual-migration message and
exits nonzero so a hand-edit can take over.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from .config.paths import paths


def _find_legacy_file() -> Path | None:
    """Return the path to ``scraper_config.js`` if present in the repo root."""
    candidate = paths().repo_root / "scraper_config.js"
    return candidate if candidate.is_file() else None


def _eval_js_via_node(js_path: Path) -> dict:
    """Spawn ``node -e`` to evaluate the legacy file and dump the resulting
    SCRAPER_CONFIG as JSON. Functions are replaced with ``null`` (the
    citation formatter etc. don't migrate as data).
    """
    if shutil.which("node") is None:
        raise RuntimeError(
            "Node.js not found on PATH. Either install Node "
            "(https://nodejs.org) or migrate scraper_config.js by hand: "
            "copy `sources`, `presets`, `arxivCategories`, `autoFetch` to "
            "data/user_config/search-sources.json and `tags` to "
            "data/user_config/auto-tag-rules.json (with the array shape "
            "documented in src/config/schema/auto-tag-rules.schema.json)."
        )
    js = (
        "const fs = require('fs');"
        f"const path = {json.dumps(str(js_path))};"
        "eval(fs.readFileSync(path, 'utf-8'));"
        "process.stdout.write(JSON.stringify("
        "  SCRAPER_CONFIG,"
        "  (k, v) => typeof v === 'function' ? undefined : v"
        "));"
    )
    result = subprocess.run(
        ["node", "-e", js],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"node failed to evaluate {js_path}:\n{result.stderr.strip()}")
    return json.loads(result.stdout)


def _convert_search_sources(legacy: dict) -> dict:
    """Project legacy sources (id-keyed map) → new schema (array of objects).

    Preserves ``arxivCategories`` and ``autoFetch`` verbatim. Presets gain
    an explicit ``id`` field (slugified from label) so x-mergeKey-based
    user overrides work.
    """
    out: dict = {}
    if isinstance(legacy.get("arxivCategories"), list):
        out["arxivCategories"] = list(legacy["arxivCategories"])
    sources_in = legacy.get("sources")
    if isinstance(sources_in, dict):
        sources_out = []
        for key, value in sources_in.items():
            if not isinstance(value, dict):
                continue
            entry = {
                "id": key,
                "label": value.get("label", key),
                "type": value.get("type", "arxiv"),
                "color": value.get("color", "#58a6ff"),
                "enabled": bool(value.get("enabled", False)),
            }
            for opt in ("journalRef", "journalName", "issn"):
                if value.get(opt) not in (None, ""):
                    entry[opt] = value[opt]
            sources_out.append(entry)
        out["sources"] = sources_out
    presets_in = legacy.get("presets")
    if isinstance(presets_in, list):
        presets_out = []
        used_ids = set()
        for p in presets_in:
            if not isinstance(p, dict):
                continue
            label = p.get("label", "")
            pid = _slug(label) or f"preset-{len(presets_out) + 1}"
            # Disambiguate collisions
            base = pid
            n = 2
            while pid in used_ids:
                pid = f"{base}-{n}"
                n += 1
            used_ids.add(pid)
            presets_out.append({"id": pid, "label": label, "query": p.get("query", "")})
        out["presets"] = presets_out
    if isinstance(legacy.get("autoFetch"), dict):
        af = legacy["autoFetch"]
        # Keep the schema field names. Legacy `delayBetweenQueries` (no
        # `Ms` suffix) maps onto the new `delayBetweenQueriesMs`.
        out["autoFetch"] = {
            "enabled": bool(af.get("enabled", True)),
            "cooldownHours": int(af.get("cooldownHours", 4)),
            "maxResultsPerQuery": int(af.get("maxResultsPerQuery", 25)),
            "delayBetweenQueriesMs": int(
                af.get("delayBetweenQueries", af.get("delayBetweenQueriesMs", 1500))
            ),
        }
    return out


def _convert_auto_tag_rules(legacy: dict) -> dict:
    """Project legacy ``tags`` map (tag → keyword list) → new
    ``{rules: [{tag, keywords}, ...]}`` schema."""
    rules = []
    tags = legacy.get("tags")
    if isinstance(tags, dict):
        for tag, kw in tags.items():
            if not isinstance(kw, list):
                continue
            # Preserve whitespace verbatim — `"Ta "` (with trailing space) is
            # used in the legacy file to disambiguate from `"Tantalum"` etc.
            # Stripping would change matching behavior.
            keywords = [str(k) for k in kw if k]
            if keywords:
                rules.append({"tag": str(tag), "keywords": keywords})
    return {"rules": rules}


def _slug(text: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    out = "-".join(p for p in out.split("-") if p)
    return out


def migrate(*, dry_run: bool = False, overwrite: bool = False) -> dict:
    """Run the migration. Returns a summary dict.

    ``dry_run`` prints what would be written without touching disk.
    ``overwrite`` clobbers existing user_config files.
    """
    legacy = _find_legacy_file()
    if legacy is None:
        return {
            "status": "nothing-to-migrate",
            "reason": "scraper_config.js not found in repo root",
        }

    data = _eval_js_via_node(legacy)
    search_doc = _convert_search_sources(data)
    autotag_doc = _convert_auto_tag_rules(data)

    user_dir = paths().repo_root / "data" / "user_config"
    user_dir.mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    skipped: list[str] = []

    def _write(name: str, doc: dict) -> None:
        target = user_dir / name
        if target.exists() and not overwrite:
            skipped.append(name)
            return
        if dry_run:
            written.append(name + " (dry-run)")
            return
        target.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        written.append(name)

    _write("search-sources.json", search_doc)
    _write("auto-tag-rules.json", autotag_doc)

    return {
        "status": "ok",
        "written": written,
        "skipped": skipped,
        "source": str(legacy),
        "search_doc": search_doc,
        "autotag_doc": autotag_doc,
    }


# ─── CLI ───


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="scq migrate-from-legacy",
        description="Convert scraper_config.js into data/user_config/*.json.",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="show what would be written without touching disk"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="replace existing user_config files (default: skip)",
    )
    args = parser.parse_args(argv)

    try:
        result = migrate(dry_run=args.dry_run, overwrite=args.overwrite)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    except Exception as e:  # noqa: BLE001
        print(f"error: {e}", file=sys.stderr)
        return 1

    if result["status"] == "nothing-to-migrate":
        print(f"nothing to migrate — {result['reason']}")
        return 0

    if args.dry_run:
        print(f"would migrate from {result['source']}:")
    else:
        print(f"migrated from {result['source']}:")
    if result["written"]:
        for name in result["written"]:
            print(f"  + {name}")
    if result["skipped"]:
        print(f"  skipped {len(result['skipped'])} existing file(s) (use --overwrite to replace):")
        for name in result["skipped"]:
            print(f"  - {name}")
    return 0
