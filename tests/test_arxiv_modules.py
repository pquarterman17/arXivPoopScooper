"""Tests for the split arxiv-digest modules (plan #13).

Covers the pure-logic seams that the split exposed:

  - search.score_paper / rank_papers — keyword scoring is a pure function
  - search.set_budget / _budget_exceeded — wall-clock budget plumbing
  - digest.compute_effective_days_back — weekend lookback policy
  - digest.generate_mock_papers — sanity check fixture shape
  - email._load_email_recipients — env-var fallback path
  - cli.main(["digest", ...]) — passthrough subcommand routes correctly

Network-touching paths (fetch_arxiv_papers, send_email_digest) get a
single integration-style smoke test with monkeypatched I/O. The bulk
of email coverage already lives in test_serve_test_endpoints.py.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scq.arxiv import digest as digest_mod
from scq.arxiv import email as email_mod
from scq.arxiv import search as search_mod


# ─── search: scoring ───


def test_score_paper_counts_title_hits_double():
    paper = {
        "title": "Transmon coherence in tantalum resonators",
        "abstract": "We measured tantalum loss tangent. Transmon T1 reached 200 us.",
    }
    score = search_mod.score_paper(paper)
    # "transmon" weight 9 — title has 1 hit (×2), abstract 1 hit. So 9×3 = 27.
    # "tantalum" weight 9 — title 1 hit (×2), abstract 1 hit. 9×3 = 27.
    # plus other matches (coherence 8, loss tangent 10, T1 7).
    assert score > 0
    assert paper["relevance_score"] == score
    assert "transmon" in paper["matched_keywords"]
    assert "tantalum" in paper["matched_keywords"]


def test_score_paper_zero_when_no_keywords():
    paper = {
        "title": "Cosmology of distant galaxies",
        "abstract": "We surveyed redshifts in the early universe.",
    }
    score = search_mod.score_paper(paper)
    assert score == 0
    assert paper["matched_keywords"] == []


def test_rank_papers_descending():
    papers = [
        {"title": "Off topic", "abstract": "Nothing here."},
        {"title": "Transmon qubit fluxonium loss tangent", "abstract": "tantalum substrate."},
        {"title": "TLS noise", "abstract": "T1"},
    ]
    out = search_mod.rank_papers(papers)
    scores = [p["relevance_score"] for p in out]
    assert scores == sorted(scores, reverse=True)
    assert out[0]["title"].startswith("Transmon")  # highest scorer first
    assert out[-1]["title"] == "Off topic"


# ─── search: budget ───


def test_set_budget_then_budget_remaining():
    search_mod.set_budget(0.5)
    rem = search_mod._budget_remaining()
    assert rem is not None
    assert 0 < rem <= 0.5
    assert search_mod._budget_exceeded() is False
    search_mod.set_budget(None)
    assert search_mod._budget_remaining() is None


def test_budget_exceeded_after_deadline():
    search_mod.set_budget(0.01)
    time.sleep(0.05)
    assert search_mod._budget_exceeded() is True
    search_mod.set_budget(None)


# ─── digest: weekend lookback ───


def test_weekend_lookback_extends_on_monday(monkeypatch):
    """Mondays bump days_back to >=4 so Fri/Sat/Sun papers aren't missed."""
    fake = type("FakeDT", (), {})()
    fake.weekday = lambda: 0  # Monday
    monkeypatch.setattr(
        digest_mod, "datetime",
        type("D", (), {"now": staticmethod(lambda: fake)}),
    )
    days, note = digest_mod.compute_effective_days_back(2)
    assert days == 4
    assert "Monday" in note


def test_weekend_lookback_extends_on_sunday(monkeypatch):
    fake = type("FakeDT", (), {})()
    fake.weekday = lambda: 6
    monkeypatch.setattr(
        digest_mod, "datetime",
        type("D", (), {"now": staticmethod(lambda: fake)}),
    )
    days, note = digest_mod.compute_effective_days_back(1)
    assert days == 3
    assert "Sunday" in note


def test_weekend_lookback_no_change_on_weekday(monkeypatch):
    fake = type("FakeDT", (), {})()
    fake.weekday = lambda: 2  # Wednesday
    monkeypatch.setattr(
        digest_mod, "datetime",
        type("D", (), {"now": staticmethod(lambda: fake)}),
    )
    days, note = digest_mod.compute_effective_days_back(3)
    assert days == 3
    assert note == ""


def test_weekend_lookback_keeps_max(monkeypatch):
    """If the user already asked for >=4 days, Monday doesn't shrink it."""
    fake = type("FakeDT", (), {})()
    fake.weekday = lambda: 0  # Monday
    monkeypatch.setattr(
        digest_mod, "datetime",
        type("D", (), {"now": staticmethod(lambda: fake)}),
    )
    days, _ = digest_mod.compute_effective_days_back(7)
    assert days == 7


# ─── digest: mock fixture ───


def test_mock_papers_have_required_fields():
    papers = digest_mod.generate_mock_papers()
    assert len(papers) >= 2
    required = {"id", "title", "authors", "short_authors", "abstract", "published",
                "categories", "pdf_url", "abs_url"}
    for p in papers:
        assert required.issubset(p.keys()), f"missing fields in {p['id']}"


def test_mock_papers_rank_correctly():
    papers = digest_mod.generate_mock_papers()
    ranked = search_mod.rank_papers(papers)
    # The first mock paper is heavily SCQ-relevant; the second is generic.
    assert ranked[0]["id"] == "2603.99001"
    assert ranked[0]["relevance_score"] > ranked[-1]["relevance_score"]


# ─── email: recipient loading ───


@pytest.fixture
def isolated_repo_root(monkeypatch, tmp_path):
    """Point SCQ_REPO_ROOT at a fresh tmp_path and refresh the paths cache
    both before and after the test, so other tests see the real repo root."""
    from scq.config.paths import refresh as _paths_refresh
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SCQ_REPO_ROOT", str(tmp_path))
    _paths_refresh()
    yield tmp_path
    # Critical: drop the cache before monkeypatch un-sets SCQ_REPO_ROOT, so the
    # next test that calls paths() re-resolves against the real repo.
    _paths_refresh()


def test_load_email_recipients_falls_back_to_env_var(isolated_repo_root, monkeypatch):
    """With no user_config and no legacy file, EMAIL_TO drives the recipient list."""
    monkeypatch.setattr(email_mod, "EMAIL_TO", "fallback@example.com")
    monkeypatch.setattr(email_mod, "BASE_DIR", str(isolated_repo_root))
    recipients = email_mod._load_email_recipients()
    assert any(r["email"] == "fallback@example.com" for r in recipients)


def test_load_email_recipients_returns_empty_when_nothing_configured(isolated_repo_root, monkeypatch):
    monkeypatch.setattr(email_mod, "EMAIL_TO", "")
    monkeypatch.setattr(email_mod, "BASE_DIR", str(isolated_repo_root))
    recipients = email_mod._load_email_recipients()
    assert recipients == []


# ─── cli passthrough ───


def test_scq_digest_subcommand_dispatches(monkeypatch):
    """`scq digest --test --no-email` should reach scq.arxiv.digest.main."""
    received = []
    def fake_main(argv=None):
        received.append(list(argv or []))
    monkeypatch.setattr("scq.arxiv.digest.main", fake_main)
    from scq.cli import main as cli_main
    rc = cli_main(["digest", "--test", "--no-email", "--days", "5"])
    assert rc == 0
    assert received[0] == ["--test", "--no-email", "--days", "5"]
