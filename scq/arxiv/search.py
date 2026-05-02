"""arXiv API client + relevance scoring (plan #13).

Two responsibilities:

  1. ``fetch_arxiv_papers(categories, days_back, max_results)`` — query the
     arXiv Atom API for recent papers in the given categories. Uses one
     OR-combined request when possible (cheaper rate-limit-wise), falls
     back to per-category requests with polite delays. Honors a wall-
     clock budget set via ``set_budget(seconds)`` so a slow arXiv can't
     hang the GH Actions runner indefinitely.

  2. ``rank_papers(papers)`` / ``score_paper(paper)`` — score papers
     against ``KEYWORD_WEIGHTS`` (title hits worth 2x abstract hits) and
     return them sorted descending.

Pure logic — no DOM, no email side-effects, no DB writes. Suitable for
unit testing with a mocked HTTP layer.
"""

from __future__ import annotations

import random
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET

# ─── Configuration ───

ARXIV_CATEGORIES = [
    "quant-ph",
    "cond-mat.supr-con",
    "cond-mat.mtrl-sci",
    "cond-mat.mes-hall",   # mesoscopic / nanoscale — catches qubit & resonator device work
    "physics.app-ph",      # applied physics — catches device fabrication papers
]

# Keywords grouped by topic with weights (higher = more relevant).
# Tuned for superconducting-quantum-computing materials research.
KEYWORD_WEIGHTS = {
    # Materials & fabrication (primary interest)
    "superconducting qubit":        10,
    "transmon":                      9,
    "fluxonium":                     9,
    "loss tangent":                 10,
    "two-level system":              8,
    "TLS":                           7,
    "surface oxide":                 9,
    "substrate":                     6,
    "tantalum":                      9,
    "niobium":                       7,
    "aluminum oxide":                7,
    "josephson junction":            8,
    "thin film":                     6,
    "fabrication":                   5,
    "surface treatment":             8,
    "materials loss":                9,
    "dielectric loss":               9,
    "quality factor":                8,
    "internal quality":              9,
    "microwave resonator":           7,
    "coplanar waveguide":            8,
    "CPW":                           7,
    "kinetic inductance":            7,
    "superinductor":                 8,

    # Qubit coherence & design
    "coherence":                     8,
    "T1":                            7,
    "T2":                            7,
    "decoherence":                   7,
    "relaxation":                    5,
    "dephasing":                     6,
    "quasiparticle":                 7,
    "noise":                         4,
    "charge noise":                  7,
    "flux noise":                    7,
    "energy relaxation":             7,
    "purcell":                       6,

    # Readout & amplification
    "parametric amplif":             7,
    "JPA":                           7,
    "TWPA":                          7,
    "dispersive readout":            7,
    "quantum-limited":               6,

    # Gates & control
    "gate fidelity":                 7,
    "optimal control":               6,
    "DRAG":                          6,
    "leakage":                       6,
    "cross-resonance":               6,

    # Resonators
    "superconducting resonator":     8,
    "microwave cavity":              6,
    "3D cavity":                     6,

    # General SCQ
    "superconducting circuit":       8,
    "circuit QED":                   7,
    "cQED":                          7,
    "quantum processor":             5,
    "quantum computing":             4,
}

ARXIV_API = "http://arxiv.org/api/query"
ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}

# Wall-clock budget (set by `set_budget(seconds)`). When the deadline passes,
# network calls return None instead of starting another attempt — keeps the
# script from chewing through the GH Actions job timeout when arXiv is slow.
# A 2026-04-29 incident hung the runner for 15 min on a single hung connection.
_BUDGET_DEADLINE = None
_HTTP_TIMEOUT = 30  # per-request socket timeout (sec)
_MAX_BACKOFF = 30   # cap any single retry wait (sec)


def set_budget(seconds: float | None) -> None:
    """Set a wall-clock deadline. Pass ``None`` to disable budgeting."""
    global _BUDGET_DEADLINE
    _BUDGET_DEADLINE = (time.monotonic() + seconds) if seconds is not None else None


def _budget_remaining():
    """Seconds left in the wall-clock budget, or None if no budget is set."""
    if _BUDGET_DEADLINE is None:
        return None
    return _BUDGET_DEADLINE - time.monotonic()


def _budget_exceeded():
    rem = _budget_remaining()
    return rem is not None and rem <= 0


def _arxiv_get(url, label, max_retries=3):
    """Fetch a URL from arXiv with polite retries.

    Retries on HTTP 429, 5xx, socket timeouts, and transient URL errors. Honors
    the server's Retry-After header when present; otherwise uses exponential
    backoff with jitter, capped at _MAX_BACKOFF.

    Aborts (returns None) if the wall-clock budget set in main() is exhausted —
    so a slow/hung arXiv can't run the GH Actions job clock out.
    """
    for attempt in range(max_retries):
        if _budget_exceeded():
            print(f"  Aborting {label}: time budget exhausted")
            return None
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "SCQDigest/1.0 (+https://github.com/pquarterman17/ScientificLitterScoop)"
            })
            resp = urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT)
            return resp.read()
        except urllib.error.HTTPError as e:
            retryable = e.code == 429 or 500 <= e.code < 600
            if not retryable or attempt == max_retries - 1:
                print(f"  Warning: Failed to fetch {label}: {e}")
                return None
            retry_after = e.headers.get("Retry-After") if e.headers else None
            try:
                wait = float(retry_after) if retry_after else 0
            except ValueError:
                wait = 0
            if wait <= 0:
                wait = min(_MAX_BACKOFF, 5 * (2 ** attempt))
            wait += random.uniform(0, wait * 0.25)  # jitter
            wait = _clamp_wait(wait)
            if wait is None:
                print(f"  Aborting {label}: time budget exhausted before retry")
                return None
            print(f"  HTTP {e.code} on {label}, retrying in {wait:.0f}s "
                  f"(attempt {attempt + 1}/{max_retries})...")
            time.sleep(wait)
        except (urllib.error.URLError, socket.timeout) as e:
            if attempt == max_retries - 1:
                print(f"  Warning: Failed to fetch {label}: {e}")
                return None
            wait = min(_MAX_BACKOFF, 5 * (2 ** attempt))
            wait += random.uniform(0, wait * 0.25)
            wait = _clamp_wait(wait)
            if wait is None:
                print(f"  Aborting {label}: time budget exhausted before retry")
                return None
            print(f"  Network error on {label} ({e}), retrying in {wait:.0f}s "
                  f"(attempt {attempt + 1}/{max_retries})...")
            time.sleep(wait)
        except Exception as e:
            print(f"  Warning: Failed to fetch {label}: {e}")
            return None
    return None


def _clamp_wait(wait):
    """Trim a sleep so we don't sleep past the deadline. Returns None if no
    budget is left at all."""
    rem = _budget_remaining()
    if rem is None:
        return wait
    if rem <= 0:
        return None
    return min(wait, rem)


def fetch_arxiv_papers(categories, days_back=1, max_results=200):
    """Fetch recent papers from arXiv API for the given categories.

    Uses a single OR'd query across all categories so we burn one rate-limit
    budget rather than five. Falls back to per-category requests (with a polite
    inter-request delay) if the combined query fails.
    """
    papers = []
    seen_ids = set()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

    # Combined OR query — one request for all categories
    combined_query = " OR ".join(f"cat:{c}" for c in categories)
    combined_max = max(max_results, max_results * len(categories) // 2, 1000)
    params = {
        "search_query": combined_query,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "max_results": str(combined_max),
    }
    url = ARXIV_API + "?" + urllib.parse.urlencode(params)
    xml_data = _arxiv_get(url, "combined query")

    roots = []
    if xml_data is not None:
        try:
            roots.append(ET.fromstring(xml_data))
        except ET.ParseError as e:
            print(f"  Warning: Failed to parse combined response: {e}")
            xml_data = None

    if xml_data is None:
        # Fallback: per-category with polite 3s delay between requests
        print("  Falling back to per-category fetches...")
        for i, cat in enumerate(categories):
            if _budget_exceeded():
                print(f"  Skipping remaining categories ({len(categories) - i} left): time budget exhausted")
                break
            if i > 0:
                time.sleep(3)  # arXiv API guideline: ~3s between requests
            params = {
                "search_query": f"cat:{cat}",
                "sortBy": "submittedDate",
                "sortOrder": "descending",
                "max_results": str(max_results),
            }
            cat_url = ARXIV_API + "?" + urllib.parse.urlencode(params)
            cat_xml = _arxiv_get(cat_url, cat)
            if cat_xml is None:
                continue
            try:
                roots.append(ET.fromstring(cat_xml))
            except ET.ParseError as e:
                print(f"  Warning: Failed to parse {cat}: {e}")

    for root in roots:
        for entry in root.findall("atom:entry", ARXIV_NS):
            # Parse published date
            published_str = entry.findtext("atom:published", "", ARXIV_NS)
            try:
                published = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                continue

            if published < cutoff:
                continue

            # Extract arXiv ID
            id_url = entry.findtext("atom:id", "", ARXIV_NS)
            arxiv_id = id_url.split("/abs/")[-1] if "/abs/" in id_url else id_url.split("/")[-1]
            # Remove version suffix
            arxiv_id = re.sub(r"v\d+$", "", arxiv_id)

            if arxiv_id in seen_ids:
                continue
            seen_ids.add(arxiv_id)

            # Extract metadata
            title = entry.findtext("atom:title", "", ARXIV_NS).strip().replace("\n", " ")
            title = re.sub(r"\s+", " ", title)

            summary = entry.findtext("atom:summary", "", ARXIV_NS).strip()
            summary = re.sub(r"\s+", " ", summary)

            authors = []
            for author in entry.findall("atom:author", ARXIV_NS):
                name = author.findtext("atom:name", "", ARXIV_NS)
                if name:
                    authors.append(name)

            categories_list = [
                tag.get("term", "") for tag in entry.findall("atom:category", ARXIV_NS)
            ]

            # PDF link
            pdf_url = ""
            for link in entry.findall("atom:link", ARXIV_NS):
                if link.get("title") == "pdf":
                    pdf_url = link.get("href", "")

            papers.append({
                "id": arxiv_id,
                "title": title,
                "authors": ", ".join(authors),
                "short_authors": _make_short_authors(authors),
                "abstract": summary,
                "published": published.isoformat(),
                "categories": categories_list,
                "pdf_url": pdf_url or f"https://arxiv.org/pdf/{arxiv_id}",
                "abs_url": f"https://arxiv.org/abs/{arxiv_id}",
            })

    for cat in categories:
        n = sum(1 for p in papers if cat in p.get("categories", []))
        print(f"  {cat}: {n} papers")

    return papers


def _make_short_authors(authors):
    """Generate 'First et al.' or 'First & Second' style short author string."""
    if len(authors) == 0:
        return "Unknown"
    if len(authors) == 1:
        return authors[0].split()[-1]
    if len(authors) == 2:
        return f"{authors[0].split()[-1]} & {authors[1].split()[-1]}"
    return f"{authors[0].split()[-1]} et al."


# ─── Relevance Scoring ───

def score_paper(paper):
    """Score a paper's relevance based on keyword matches in title + abstract."""
    text = (paper["title"] + " " + paper["abstract"]).lower()
    score = 0
    matched_keywords = []

    for keyword, weight in KEYWORD_WEIGHTS.items():
        kw_lower = keyword.lower()
        # Count occurrences (title matches count double)
        title_hits = paper["title"].lower().count(kw_lower)
        abstract_hits = text.count(kw_lower) - title_hits
        if title_hits > 0 or abstract_hits > 0:
            kw_score = (title_hits * 2 + abstract_hits) * weight
            score += kw_score
            matched_keywords.append(keyword)

    paper["relevance_score"] = score
    paper["matched_keywords"] = matched_keywords
    return score


def rank_papers(papers):
    """Score and sort papers by relevance."""
    for p in papers:
        score_paper(p)
    papers.sort(key=lambda p: p["relevance_score"], reverse=True)
    return papers
