"""Tests for scq.migrate (plan #23).

The Node-based JS-eval path is exercised via monkeypatch — CI doesn't
need to pin a specific Node version. The pure conversion helpers
(_convert_search_sources, _convert_auto_tag_rules) are tested directly.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scq import migrate  # noqa: E402


# ─── _convert_search_sources ───


def test_convert_search_sources_translates_id_keyed_map_to_array():
    legacy = {
        "sources": {
            "arxiv": {"label": "arXiv", "color": "#58a6ff", "enabled": True, "type": "arxiv"},
            "prl": {"label": "PRL", "color": "#bc8cff", "enabled": False, "type": "arxiv-jr",
                    "journalRef": "Phys.+Rev.+Lett.", "journalName": "Phys. Rev. Lett."},
        },
    }
    out = migrate._convert_search_sources(legacy)
    ids = [s["id"] for s in out["sources"]]
    assert set(ids) == {"arxiv", "prl"}
    prl = next(s for s in out["sources"] if s["id"] == "prl")
    assert prl["journalRef"] == "Phys.+Rev.+Lett."


def test_convert_search_sources_omits_empty_optional_fields():
    legacy = {"sources": {"arxiv": {"label": "arXiv", "type": "arxiv", "color": "#58a6ff",
                                    "enabled": True, "journalRef": "", "issn": None}}}
    out = migrate._convert_search_sources(legacy)
    src = out["sources"][0]
    assert "journalRef" not in src
    assert "issn" not in src


def test_convert_search_sources_carries_arxiv_categories():
    legacy = {"arxivCategories": ["quant-ph", "cond-mat.supr-con"]}
    out = migrate._convert_search_sources(legacy)
    assert out["arxivCategories"] == ["quant-ph", "cond-mat.supr-con"]


def test_convert_search_sources_assigns_preset_ids_and_disambiguates():
    legacy = {"presets": [
        {"label": "SCQ materials", "query": "superconducting qubit material"},
        {"label": "SCQ materials", "query": "duplicate label"},
    ]}
    out = migrate._convert_search_sources(legacy)
    assert out["presets"][0]["id"] == "scq-materials"
    assert out["presets"][1]["id"] == "scq-materials-2"


def test_convert_search_sources_normalises_autoFetch_field_name():
    """Legacy `delayBetweenQueries` (no `Ms`) → new `delayBetweenQueriesMs`."""
    legacy = {"autoFetch": {"enabled": False, "cooldownHours": 6,
                            "maxResultsPerQuery": 50, "delayBetweenQueries": 2000}}
    out = migrate._convert_search_sources(legacy)
    assert out["autoFetch"]["delayBetweenQueriesMs"] == 2000
    assert out["autoFetch"]["enabled"] is False


def test_convert_search_sources_handles_missing_sections():
    """Empty input should produce an empty (but valid-shape) document."""
    out = migrate._convert_search_sources({})
    assert out == {}


# ─── _convert_auto_tag_rules ───


def test_convert_auto_tag_rules_translates_map_to_rules_array():
    legacy = {"tags": {
        "tantalum": ["tantalum", "Ta ", "Ta-based"],
        "TLS": ["two-level system", "TLS"],
    }}
    out = migrate._convert_auto_tag_rules(legacy)
    tags = {r["tag"]: r["keywords"] for r in out["rules"]}
    assert tags["tantalum"] == ["tantalum", "Ta ", "Ta-based"]
    assert tags["TLS"] == ["two-level system", "TLS"]


def test_convert_auto_tag_rules_drops_tags_with_no_keywords():
    legacy = {"tags": {"empty": [], "real": ["match"]}}
    out = migrate._convert_auto_tag_rules(legacy)
    tags = {r["tag"] for r in out["rules"]}
    assert tags == {"real"}


def test_convert_auto_tag_rules_preserves_significant_trailing_whitespace():
    """`"Ta "` (trailing space) is intentional in the legacy file to keep
    `"Tantalum"` from matching the `tantalum` tag's `"Ta "` keyword.
    The migration must preserve that semantics."""
    legacy = {"tags": {"foo": ["Ta ", "Al "]}}
    out = migrate._convert_auto_tag_rules(legacy)
    assert out["rules"][0]["keywords"] == ["Ta ", "Al "]


# ─── _slug ───


def test_slug_basic():
    assert migrate._slug("Hello World") == "hello-world"


def test_slug_collapses_runs_and_strips_edges():
    assert migrate._slug(" -- Foo  Bar -- ") == "foo-bar"


def test_slug_handles_punctuation_only_input():
    """All-non-alphanumeric inputs return empty (caller falls back to preset-N)."""
    assert migrate._slug("!!!") == ""


# ─── migrate(): file plumbing ───


@pytest.fixture
def fake_repo(monkeypatch, tmp_path):
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    from scq.config.paths import refresh as _paths_refresh
    _paths_refresh()
    yield tmp_path
    _paths_refresh()


def test_migrate_returns_nothing_to_migrate_when_legacy_absent(fake_repo):
    result = migrate.migrate()
    assert result["status"] == "nothing-to-migrate"


def test_migrate_writes_user_config_files(fake_repo, monkeypatch):
    (fake_repo / "scraper_config.js").write_text("/* placeholder */", encoding="utf-8")
    legacy_data = {
        "arxivCategories": ["quant-ph"],
        "sources": {"arxiv": {"label": "arXiv", "color": "#58a6ff", "enabled": True, "type": "arxiv"}},
        "presets": [{"label": "SCQ materials", "query": "qubit"}],
        "tags": {"tantalum": ["tantalum"]},
        "autoFetch": {"enabled": True, "cooldownHours": 4, "maxResultsPerQuery": 25, "delayBetweenQueries": 1500},
    }
    monkeypatch.setattr(migrate, "_eval_js_via_node", lambda _: legacy_data)
    result = migrate.migrate()
    assert result["status"] == "ok"
    assert "search-sources.json" in result["written"]
    assert "auto-tag-rules.json" in result["written"]
    on_disk = json.loads((fake_repo / "data" / "user_config" / "search-sources.json").read_text())
    assert on_disk["sources"][0]["id"] == "arxiv"


def test_migrate_skips_existing_files_by_default(fake_repo, monkeypatch):
    user_dir = fake_repo / "data" / "user_config"
    user_dir.mkdir(parents=True)
    (user_dir / "search-sources.json").write_text('{"existing": true}', encoding="utf-8")
    (fake_repo / "scraper_config.js").write_text("/* placeholder */", encoding="utf-8")
    monkeypatch.setattr(migrate, "_eval_js_via_node", lambda _: {"sources": {}})
    result = migrate.migrate()
    assert "search-sources.json" in result["skipped"]
    # Existing file unchanged
    on_disk = json.loads((user_dir / "search-sources.json").read_text())
    assert on_disk == {"existing": True}


def test_migrate_overwrite_replaces(fake_repo, monkeypatch):
    user_dir = fake_repo / "data" / "user_config"
    user_dir.mkdir(parents=True)
    (user_dir / "search-sources.json").write_text('{"existing": true}', encoding="utf-8")
    (fake_repo / "scraper_config.js").write_text("/* placeholder */", encoding="utf-8")
    monkeypatch.setattr(migrate, "_eval_js_via_node",
                        lambda _: {"sources": {"arxiv": {"label": "arXiv", "color": "#58a6ff",
                                                         "enabled": True, "type": "arxiv"}}})
    result = migrate.migrate(overwrite=True)
    assert "search-sources.json" in result["written"]
    on_disk = json.loads((user_dir / "search-sources.json").read_text())
    assert on_disk["sources"][0]["id"] == "arxiv"


def test_migrate_dry_run_does_not_touch_disk(fake_repo, monkeypatch):
    (fake_repo / "scraper_config.js").write_text("/* placeholder */", encoding="utf-8")
    monkeypatch.setattr(migrate, "_eval_js_via_node",
                        lambda _: {"sources": {"arxiv": {"label": "arXiv", "color": "#58a6ff",
                                                         "enabled": True, "type": "arxiv"}}})
    result = migrate.migrate(dry_run=True)
    assert "(dry-run)" in result["written"][0]
    assert not (fake_repo / "data" / "user_config" / "search-sources.json").exists()


def test_migrate_propagates_node_error(fake_repo, monkeypatch):
    (fake_repo / "scraper_config.js").write_text("/* placeholder */", encoding="utf-8")
    def boom(_):
        raise RuntimeError("Node.js not found on PATH...")
    monkeypatch.setattr(migrate, "_eval_js_via_node", boom)
    with pytest.raises(RuntimeError, match="Node"):
        migrate.migrate()


# ─── CLI ───


def test_cli_dispatches_via_scq(fake_repo, capsys, monkeypatch):
    (fake_repo / "scraper_config.js").write_text("/* placeholder */", encoding="utf-8")
    monkeypatch.setattr(migrate, "_eval_js_via_node",
                        lambda _: {"sources": {"arxiv": {"label": "arXiv", "color": "#58a6ff",
                                                         "enabled": True, "type": "arxiv"}}})
    from scq.cli import main as cli_main
    rc = cli_main(["migrate-from-legacy", "--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "would migrate" in out
    assert "search-sources.json" in out


def test_cli_no_legacy_file_prints_message(fake_repo, capsys):
    from scq.cli import main as cli_main
    rc = cli_main(["migrate-from-legacy"])
    assert rc == 0
    assert "nothing to migrate" in capsys.readouterr().out


def test_cli_node_missing_returns_2(fake_repo, capsys, monkeypatch):
    (fake_repo / "scraper_config.js").write_text("/* placeholder */", encoding="utf-8")
    def boom(_):
        raise RuntimeError("Node.js not found on PATH")
    monkeypatch.setattr(migrate, "_eval_js_via_node", boom)
    from scq.cli import main as cli_main
    rc = cli_main(["migrate-from-legacy"])
    assert rc == 2
    assert "Node" in capsys.readouterr().err
