"""Daily-digest orchestrator (plan #13).

The thin glue layer that ties :mod:`scq.arxiv.search`,
:mod:`scq.arxiv.render`, and :mod:`scq.arxiv.email` together. Argument
parsing and runtime choices (mock data, weekend smart-lookback, network
budget) live here; everything else is in the focused modules.

Module entry point: ``python -m scq.arxiv.digest [--days 3] [...]``
or via the CLI: ``scq digest [...]``. The legacy
``python tools/arxiv_digest.py`` invocation is preserved by a thin shim.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

from scq.arxiv import search as _search
from scq.arxiv import email as _email
from scq.arxiv.render import generate_html_digest
from scq.arxiv.search import (
    ARXIV_CATEGORIES,
    fetch_arxiv_papers,
    rank_papers,
)
from scq.arxiv.email import send_email_digest

# Where finished digest HTMLs land. `paths().digests_dir` is the canonical
# resolver and respects user_config/paths.toml + SCQ_DIGESTS_DIR. Falls back
# to repo-relative `digests/` for source-checkout invocations before
# ``pip install``.
try:
    from scq.config.paths import paths as _scq_paths
    DIGEST_DIR = str(_scq_paths().digests_dir)
except Exception:  # noqa: BLE001
    DIGEST_DIR = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "digests",
    )


# ─── Mock data (used by --test mode) ───

def generate_mock_papers():
    """Generate mock papers for testing when arXiv API is unavailable."""
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "2603.99001",
            "title": "Reduced Dielectric Loss in Tantalum-Based Superconducting Resonators via Surface Treatment",
            "authors": "A. Smith, B. Jones, C. Lee, D. Patel",
            "short_authors": "Smith et al.",
            "abstract": (
                "We demonstrate a 3x reduction in dielectric loss tangent in tantalum "
                "superconducting microwave resonators via a novel surface treatment "
                "process. Quality factors approaching 5x10^6 are achieved at single "
                "photon power. The treatment removes amorphous oxide layers and "
                "passivates the substrate, eliminating two-level system loss "
                "mechanisms that previously dominated transmon qubit coherence."
            ),
            "published": now.isoformat(),
            "categories": ["cond-mat.supr-con", "quant-ph"],
            "pdf_url": "https://arxiv.org/pdf/2603.99001",
            "abs_url": "https://arxiv.org/abs/2603.99001",
        },
        {
            "id": "2603.99002",
            "title": "Generic Quantum Algorithms (off-topic test)",
            "authors": "X. Doe",
            "short_authors": "Doe",
            "abstract": "Generic abstract that should score low on relevance.",
            "published": now.isoformat(),
            "categories": ["quant-ph"],
            "pdf_url": "https://arxiv.org/pdf/2603.99002",
            "abs_url": "https://arxiv.org/abs/2603.99002",
        },
    ]


# ─── Weekend smart lookback ───

def compute_effective_days_back(days_back):
    """Return ``(effective_days, note)`` adjusting for weekends.

    arXiv announces papers Sunday–Friday US Eastern. A 3-day lookback
    that runs early Saturday catches Wed/Thu/Fri; one that runs early
    Monday only catches Sun (which is sparse). On Mondays, extend to
    cover the previous business day. ``note`` is a human-readable
    explanation when the value was bumped, else ``""``.
    """
    today = datetime.now()
    weekday = today.weekday()  # 0=Mon ... 6=Sun
    note = ""
    if weekday == 0:  # Monday
        days_back = max(days_back, 4)
        note = f"Monday — extending lookback to {days_back} days to cover Fri+Sat+Sun"
    elif weekday == 6:  # Sunday
        days_back = max(days_back, 3)
        note = f"Sunday — extending lookback to {days_back} days"
    return days_back, note


# ─── Main ───

def main(argv=None):
    parser = argparse.ArgumentParser(description="SCQ arXiv Daily Digest")
    parser.add_argument("--days", type=int, default=3, help="Days to look back (default: 3)")
    parser.add_argument("--no-email", action="store_true", help="Skip email, generate HTML only")
    parser.add_argument("--test", action="store_true", help="Use mock data (no network)")
    parser.add_argument("--max-results", type=int, default=500, help="Max papers per category")
    parser.add_argument(
        "--smart-weekend", action="store_true",
        help="Auto-extend lookback on weekends so Friday's papers are not missed"
    )
    parser.add_argument(
        "--budget-seconds", type=int, default=600,
        help="Hard wall-clock budget for arXiv fetching (default: 600s). "
             "Leaves runway under the GH Actions 15-min job timeout."
    )
    args = parser.parse_args(argv)

    # Set the network deadline. Anything in _arxiv_get that would push past
    # this aborts cleanly with a logged warning. 0/negative disables.
    if args.budget_seconds > 0:
        _search.set_budget(args.budget_seconds)
        print(f"  Network budget: {args.budget_seconds}s")

    days_back = args.days

    # Apply weekend adjustment when requested
    if args.smart_weekend:
        days_back, note = compute_effective_days_back(days_back)
        if note:
            print(f"  ⚠  {note}")

    digest_date = datetime.now().strftime("%Y-%m-%d")
    print(f"SCQ arXiv Digest — {digest_date}")
    print(f"  Categories: {', '.join(ARXIV_CATEGORIES)}")
    print(f"  Looking back: {days_back} day(s)")

    # Fetch papers
    if args.test:
        print("\n  Using mock data for testing...")
        papers = generate_mock_papers()
    else:
        print("\nFetching from arXiv API...")
        papers = fetch_arxiv_papers(
            ARXIV_CATEGORIES,
            days_back=days_back,
            max_results=args.max_results,
        )

    if not papers:
        print("\nNo new papers found — sending empty digest so the run is visible.")
        papers = []
    else:
        print(f"\nRanking {len(papers)} papers...")
        papers = rank_papers(papers)

    relevant = sum(1 for p in papers if p["relevance_score"] >= 5)
    print(f"  {relevant} papers match SCQ keywords")

    # Generate HTML digest
    print("\nGenerating digest...")
    os.makedirs(DIGEST_DIR, exist_ok=True)
    digest_path = os.path.join(DIGEST_DIR, f"digest_{digest_date}.html")
    generate_html_digest(papers, digest_date, digest_path)

    # Send email
    if not args.no_email:
        send_email_digest(papers, digest_date)
    else:
        print("  Email skipped (--no-email)")

    print(f"\nDone! {len(papers)} papers processed.")
    return digest_path


if __name__ == "__main__":
    main()
