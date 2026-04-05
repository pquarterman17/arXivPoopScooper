#!/usr/bin/env python3
"""
arXiv Daily Digest for SCQ Papers

Fetches recent papers from arXiv categories relevant to superconducting
quantum computing, ranks them by keyword relevance, and generates:
  1. A styled HTML digest with "Add to Read List" triage buttons
  2. An email summary sent via Gmail SMTP

Papers triaged as "add" are written to pending_papers.json for import
into the SCQ paper database.

Usage:
  python tools/arxiv_digest.py                    # run digest (last 24h)
  python tools/arxiv_digest.py --days 3           # last 3 days
  python tools/arxiv_digest.py --no-email         # HTML only, skip email
  python tools/arxiv_digest.py --test             # test with mock data
  python tools/arxiv_digest.py --smart-weekend    # auto-adjust on weekends
"""

import argparse
import json
import os
import re
import sys
import smtplib
import time
import urllib.error
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from xml.etree import ElementTree as ET

# ─── Configuration ───

ARXIV_CATEGORIES = [
    "quant-ph",
    "cond-mat.supr-con",
    "cond-mat.mtrl-sci",
    "cond-mat.mes-hall",   # mesoscopic / nanoscale — catches qubit & resonator device work
    "physics.app-ph",      # applied physics — catches device fabrication papers
]

# Keywords grouped by topic with weights (higher = more relevant)
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

# Base directory (project root)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIGEST_DIR = os.path.join(BASE_DIR, "digests")
PENDING_FILE = os.path.join(BASE_DIR, "pending_papers.json")

# Email config — set these environment variables or edit directly
EMAIL_FROM = os.environ.get("SCQ_EMAIL_FROM", "")
EMAIL_TO = os.environ.get("SCQ_EMAIL_TO", "paige.e.quarterman@gmail.com")
EMAIL_APP_PASSWORD = os.environ.get("SCQ_EMAIL_APP_PASSWORD", "")


# ─── arXiv API ───

ARXIV_API = "http://arxiv.org/api/query"
ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


def fetch_arxiv_papers(categories, days_back=1, max_results=200):
    """Fetch recent papers from arXiv API for given categories."""
    papers = []
    seen_ids = set()

    for cat in categories:
        # Build query: category + date range
        query = f"cat:{cat}"
        params = {
            "search_query": query,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
            "max_results": str(max_results),
        }
        url = ARXIV_API + "?" + urllib.parse.urlencode(params)

        # Retry with exponential backoff for rate limits (429)
        xml_data = None
        max_retries = 4
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(url, headers={
                    "User-Agent": "SCQDigest/1.0 (paige.e.quarterman@gmail.com)"
                })
                resp = urllib.request.urlopen(req, timeout=30)
                xml_data = resp.read()
                break  # Success
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < max_retries - 1:
                    wait = [10, 30, 60, 120][attempt]
                    print(f"  Rate limited on {cat}, retrying in {wait}s (attempt {attempt + 1}/{max_retries})...")
                    time.sleep(wait)
                else:
                    print(f"  Warning: Failed to fetch {cat}: {e}")
                    break
            except Exception as e:
                print(f"  Warning: Failed to fetch {cat}: {e}")
                break
        if xml_data is None:
            continue

        root = ET.fromstring(xml_data)

        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

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

        print(f"  {cat}: found {sum(1 for p in papers if cat in p.get('categories', []))} papers")
        # Be polite to arXiv API
        time.sleep(3)

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


# ─── HTML Digest Generator ───

def generate_html_digest(papers, digest_date, output_path):
    """Generate a styled HTML digest with triage buttons."""
    high_relevance = [p for p in papers if p["relevance_score"] >= 20]
    medium_relevance = [p for p in papers if 5 <= p["relevance_score"] < 20]
    low_relevance = [p for p in papers if p["relevance_score"] < 5]

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SCQ arXiv Digest — {digest_date}</title>
<style>
  :root {{
    --bg: #0d1117; --bg2: #161b22; --bg3: #21262d;
    --text: #e6edf3; --text2: #8b949e; --text3: #6e7681;
    --accent: #58a6ff; --green: #3fb950; --orange: #d29922;
    --red: #f85149; --border: #30363d;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.6;
    max-width: 1000px; margin: 0 auto; padding: 24px;
  }}
  h1 {{ color: var(--accent); margin-bottom: 4px; font-size: 24px; }}
  .subtitle {{ color: var(--text2); margin-bottom: 24px; font-size: 14px; }}
  .stats {{ display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }}
  .stat {{ background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;
           padding: 8px 16px; font-size: 13px; }}
  .stat b {{ color: var(--accent); }}

  .section-header {{
    font-size: 16px; font-weight: 600; margin: 24px 0 12px 0;
    padding: 8px 12px; border-radius: 6px;
  }}
  .section-high {{ background: rgba(63,185,80,0.1); border-left: 3px solid var(--green); color: var(--green); }}
  .section-medium {{ background: rgba(210,153,34,0.1); border-left: 3px solid var(--orange); color: var(--orange); }}
  .section-low {{ background: rgba(139,148,158,0.1); border-left: 3px solid var(--text3); color: var(--text3); }}

  .paper-card {{
    background: var(--bg2); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px; margin-bottom: 12px; transition: border-color 0.2s;
  }}
  .paper-card:hover {{ border-color: var(--accent); }}
  .paper-card.triaged-add {{ border-color: var(--green); opacity: 0.7; }}
  .paper-card.triaged-skip {{ opacity: 0.35; }}

  .paper-title {{ font-size: 15px; font-weight: 600; margin-bottom: 4px; }}
  .paper-title a {{ color: var(--text); text-decoration: none; }}
  .paper-title a:hover {{ color: var(--accent); text-decoration: underline; }}
  .paper-meta {{ font-size: 12px; color: var(--text2); margin-bottom: 8px; }}
  .paper-meta a {{ color: var(--accent); text-decoration: none; }}
  .paper-abstract {{ font-size: 13px; color: var(--text2); margin-bottom: 10px;
                     max-height: 120px; overflow: hidden; transition: max-height 0.3s; }}
  .paper-abstract.expanded {{ max-height: none; }}
  .expand-btn {{ font-size: 11px; color: var(--accent); cursor: pointer; background: none;
                  border: none; padding: 0; margin-bottom: 8px; }}

  .keywords {{ display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }}
  .kw-tag {{ font-size: 10px; padding: 2px 6px; border-radius: 3px;
             background: rgba(88,166,255,0.15); color: var(--accent); }}
  .score-badge {{ font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
                  float: right; }}
  .score-high {{ background: rgba(63,185,80,0.2); color: var(--green); }}
  .score-med {{ background: rgba(210,153,34,0.2); color: var(--orange); }}
  .score-low {{ background: rgba(139,148,158,0.2); color: var(--text3); }}

  .triage-row {{ display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }}
  .triage-btns {{ display: flex; gap: 6px; align-items: center; }}
  .triage-btns button, .triage-btns a {{
    font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 4px;
    cursor: pointer; border: 1px solid var(--border); font-family: inherit;
    transition: all 0.2s; text-decoration: none; display: inline-block;
  }}
  .btn-add {{ background: rgba(63,185,80,0.15); color: var(--green); border-color: var(--green); }}
  .btn-add:hover {{ background: rgba(63,185,80,0.3); }}
  .btn-add.active {{ background: rgba(63,185,80,0.4); box-shadow: 0 0 0 2px var(--green); }}
  .btn-star {{ background: rgba(210,153,34,0.15); color: var(--orange); border-color: var(--orange); }}
  .btn-star:hover {{ background: rgba(210,153,34,0.3); }}
  .btn-star.active {{ background: rgba(210,153,34,0.4); box-shadow: 0 0 0 2px var(--orange); }}
  .btn-ignore {{ background: var(--bg3); color: var(--text3); }}
  .btn-ignore:hover {{ background: var(--border); color: var(--text2); }}
  .btn-ignore.active {{ background: rgba(248,81,73,0.2); color: var(--red); border-color: var(--red); }}
  .btn-skip {{ background: var(--bg3); color: var(--text3); }}
  .btn-skip:hover {{ background: var(--border); color: var(--text2); }}
  .btn-pdf {{ background: rgba(88,166,255,0.1); color: var(--accent); border-color: var(--accent); }}
  .btn-pdf:hover {{ background: rgba(88,166,255,0.25); }}

  .tag-row {{ display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }}
  .tag-btn {{ font-size: 10px; padding: 2px 8px; border-radius: 10px; cursor: pointer;
              border: 1px solid var(--border); background: var(--bg3); color: var(--text2);
              transition: all 0.15s; font-family: inherit; }}
  .tag-btn:hover {{ border-color: var(--accent); color: var(--accent); }}
  .tag-btn.selected {{ background: rgba(88,166,255,0.2); color: var(--accent); border-color: var(--accent); }}
  .custom-tag-input {{ font-size: 10px; padding: 2px 8px; border-radius: 10px;
                       border: 1px solid var(--border); background: var(--bg); color: var(--text);
                       width: 90px; font-family: inherit; }}
  .custom-tag-input::placeholder {{ color: var(--text3); }}

  .triage-status {{ font-size: 11px; font-weight: 600; margin-left: 8px; }}

  .paper-card.triaged-ignore {{ opacity: 0.25; }}
  .paper-card.triaged-star {{ border-color: var(--orange); border-width: 2px; }}

  .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border);
             font-size: 12px; color: var(--text3); text-align: center; }}
  .save-bar {{
    position: sticky; bottom: 0; background: var(--bg2); border-top: 1px solid var(--border);
    padding: 12px 16px; text-align: center; z-index: 100;
  }}
  .save-bar button {{
    font-size: 13px; font-weight: 600; padding: 8px 24px; border-radius: 6px;
    cursor: pointer; border: none; font-family: inherit;
    background: var(--green); color: #000;
  }}
  .save-bar button:hover {{ filter: brightness(1.1); }}
  .save-bar .count {{ font-size: 12px; color: var(--text2); margin-left: 12px; }}
</style>
</head>
<body>

<h1>SCQ arXiv Digest</h1>
<p class="subtitle">{digest_date} &mdash; {len(papers)} papers from {', '.join(ARXIV_CATEGORIES)}</p>

<div class="stats">
  <div class="stat"><b>{len(high_relevance)}</b> high relevance</div>
  <div class="stat"><b>{len(medium_relevance)}</b> medium relevance</div>
  <div class="stat"><b>{len(low_relevance)}</b> other</div>
</div>
"""

    def render_papers(papers_list):
        cards = ""
        for p in papers_list:
            score = p["relevance_score"]
            score_class = "score-high" if score >= 20 else ("score-med" if score >= 5 else "score-low")
            kw_html = "".join(f'<span class="kw-tag">{kw}</span>' for kw in p["matched_keywords"][:6])
            safe_id = p["id"].replace(".", "_")
            authors_short = p["short_authors"]
            cats = ", ".join(p["categories"][:3])

            # Escape HTML in abstract
            abstract = p["abstract"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

            # JSON-safe paper data for the triage button
            paper_json = json.dumps({
                "id": p["id"], "title": p["title"], "authors": p["authors"],
                "short_authors": p["short_authors"],
                "year": datetime.fromisoformat(p["published"]).year,
                "abstract": p["abstract"][:500],
                "categories": p["categories"],
                "pdf_url": p["pdf_url"], "abs_url": p["abs_url"],
            }).replace("'", "&#39;").replace('"', "&quot;")

            cards += f"""
  <div class="paper-card" id="card-{safe_id}">
    <span class="score-badge {score_class}">{score}</span>
    <div class="paper-title"><a href="{p['abs_url']}" target="_blank">{p['title']}</a></div>
    <div class="paper-meta">
      {authors_short} &middot; {p['published'][:10]} &middot; {cats}
      &middot; <a href="{p['abs_url']}" target="_blank">{p['id']}</a>
    </div>
    <div class="paper-abstract" id="abs-{safe_id}">{abstract}</div>
    <button class="expand-btn" onclick="toggleAbstract('{safe_id}')">show more</button>
    <div class="keywords">{kw_html}</div>
    <div class="triage-row">
      <div class="triage-btns">
        <button class="btn-add" id="btn-add-{safe_id}" onclick="triagePaper('{safe_id}', 'add', '{paper_json}')">+ Read List</button>
        <button class="btn-star" id="btn-star-{safe_id}" onclick="triagePaper('{safe_id}', 'star', '{paper_json}')">&#9733; Star</button>
        <button class="btn-ignore" id="btn-ignore-{safe_id}" onclick="triagePaper('{safe_id}', 'ignore')">&#10005; Ignore</button>
        <a class="btn-pdf" href="{p['pdf_url']}" target="_blank">PDF</a>
        <span class="triage-status" id="status-{safe_id}"></span>
      </div>
    </div>
    <div class="tag-row" id="tags-{safe_id}"></div>
  </div>"""
        return cards

    if high_relevance:
        html += '<div class="section-header section-high">High Relevance</div>'
        html += render_papers(high_relevance)
    if medium_relevance:
        html += '<div class="section-header section-medium">Medium Relevance</div>'
        html += render_papers(medium_relevance)
    if low_relevance:
        html += f'<div class="section-header section-low">Other ({len(low_relevance)} papers)</div>'
        html += render_papers(low_relevance)

    html += f"""
<div class="save-bar">
  <button onclick="savePending()">Save Triage Selections</button>
  <span class="count" id="triage-count">0 papers selected</span>
</div>

<div class="footer">
  Generated by SCQ arXiv Digest &middot; Categories: {', '.join(ARXIV_CATEGORIES)}
</div>

<script>
// ── State ──
const triaged = {{}};           // id -> {{action, data, tags, priority}}
const paperTags = {{}};         // id -> Set of tag strings
const TRIAGE_PREFIX = 'scq-triage-';
const TRIAGE_EXPIRY_DAYS = 14;

// Preset tags from scraper_config
const PRESET_TAGS = [
  "tantalum","aluminum","niobium","TLS","surface loss","Josephson junction",
  "transmon","resonator","qubit","kinetic inductance","quasiparticle",
  "oxide","sapphire","silicon","coherence","decoherence","microwave",
  "cryogenic","fabrication","quality factor"
];

// ── localStorage helpers ──
function persistTriage(id) {{
  try {{
    localStorage.setItem(TRIAGE_PREFIX + id, JSON.stringify({{
      action: triaged[id]?.action || 'none',
      tags: Array.from(paperTags[id] || []),
      priority: triaged[id]?.priority || 0,
      ts: Date.now()
    }}));
  }} catch(e) {{}}
}}

function getPersistedTriage(id) {{
  try {{
    const raw = localStorage.getItem(TRIAGE_PREFIX + id);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > TRIAGE_EXPIRY_DAYS * 86400000) {{
      localStorage.removeItem(TRIAGE_PREFIX + id);
      return null;
    }}
    return data;
  }} catch(e) {{ return null; }}
}}

// ── Render tag row for a paper ──
function renderTagRow(id) {{
  const row = document.getElementById('tags-' + id);
  if (!row) return;
  const selected = paperTags[id] || new Set();
  let html = PRESET_TAGS.map(t =>
    `<button class="tag-btn${{selected.has(t) ? ' selected' : ''}}" onclick="toggleTag('${{id}}','${{t}}')">${{t}}</button>`
  ).join('');
  html += `<input class="custom-tag-input" placeholder="+ custom" onkeydown="if(event.key==='Enter')addCustomTag('${{id}}',this)">`;
  row.innerHTML = html;
}}

function toggleTag(id, tag) {{
  if (!paperTags[id]) paperTags[id] = new Set();
  if (paperTags[id].has(tag)) paperTags[id].delete(tag);
  else paperTags[id].add(tag);
  if (triaged[id]) triaged[id].tags = Array.from(paperTags[id]);
  renderTagRow(id);
  persistTriage(id);
}}

function addCustomTag(id, input) {{
  const tag = input.value.trim();
  if (!tag) return;
  if (!paperTags[id]) paperTags[id] = new Set();
  paperTags[id].add(tag);
  if (triaged[id]) triaged[id].tags = Array.from(paperTags[id]);
  input.value = '';
  renderTagRow(id);
  persistTriage(id);
}}

// ── On page load: restore triage state ──
document.addEventListener('DOMContentLoaded', function() {{
  document.querySelectorAll('.paper-card').forEach(function(card) {{
    const id = card.id.replace('card-', '');
    const prev = getPersistedTriage(id);
    if (!prev) {{ renderTagRow(id); return; }}

    // Restore tags
    if (prev.tags && prev.tags.length) paperTags[id] = new Set(prev.tags);

    const status = document.getElementById('status-' + id);
    if (prev.action === 'add' || prev.action === 'star') {{
      card.className = 'paper-card triaged-' + prev.action;
      const btn = document.getElementById('btn-' + prev.action + '-' + id);
      if (btn) btn.classList.add('active');
      status.textContent = prev.action === 'star' ? '★ Starred' : '✓ Added';
      status.style.color = prev.action === 'star' ? 'var(--orange)' : 'var(--green)';
    }} else if (prev.action === 'ignore') {{
      card.className = 'paper-card triaged-ignore';
      const btn = document.getElementById('btn-ignore-' + id);
      if (btn) btn.classList.add('active');
      status.textContent = 'ignored';
      status.style.color = 'var(--red)';
    }}
    renderTagRow(id);
  }});
  updateCount();
}});

function toggleAbstract(id) {{
  const el = document.getElementById('abs-' + id);
  const btn = el.nextElementSibling;
  el.classList.toggle('expanded');
  btn.textContent = el.classList.contains('expanded') ? 'show less' : 'show more';
}}

function triagePaper(id, action, paperJson) {{
  const card = document.getElementById('card-' + id);
  const status = document.getElementById('status-' + id);

  // Clear previous active states
  ['add','star','ignore'].forEach(a => {{
    const b = document.getElementById('btn-' + a + '-' + id);
    if (b) b.classList.remove('active');
  }});

  // Toggle: clicking same action again deselects
  if (triaged[id] && triaged[id].action === action) {{
    delete triaged[id];
    card.className = 'paper-card';
    status.textContent = '';
    persistTriage(id);
    updateCount();
    return;
  }}

  const tags = Array.from(paperTags[id] || []);

  if (action === 'add') {{
    const data = JSON.parse(paperJson.replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    triaged[id] = {{ action: 'add', data: data, tags: tags, priority: 0 }};
    card.className = 'paper-card triaged-add';
    document.getElementById('btn-add-' + id).classList.add('active');
    status.textContent = '✓ Added';
    status.style.color = 'var(--green)';
  }} else if (action === 'star') {{
    const data = JSON.parse(paperJson.replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    triaged[id] = {{ action: 'star', data: data, tags: tags, priority: 3 }};
    card.className = 'paper-card triaged-star';
    document.getElementById('btn-star-' + id).classList.add('active');
    status.textContent = '★ Starred (high priority)';
    status.style.color = 'var(--orange)';
  }} else if (action === 'ignore') {{
    triaged[id] = {{ action: 'ignore', tags: tags, priority: -1 }};
    card.className = 'paper-card triaged-ignore';
    document.getElementById('btn-ignore-' + id).classList.add('active');
    status.textContent = 'ignored';
    status.style.color = 'var(--red)';
  }}
  persistTriage(id);
  updateCount();
}}

function updateCount() {{
  const adds = Object.values(triaged).filter(t => t.action === 'add' || t.action === 'star').length;
  const ignored = Object.values(triaged).filter(t => t.action === 'ignore').length;
  let txt = adds + ' to add';
  if (ignored) txt += ', ' + ignored + ' ignored';
  document.getElementById('triage-count').textContent = txt;
}}

function savePending() {{
  const toAdd = Object.entries(triaged)
    .filter(([_, t]) => t.action === 'add' || t.action === 'star')
    .map(([id, t]) => ({{ ...t.data, tags: t.tags, priority: t.priority }}));

  const toIgnore = Object.entries(triaged)
    .filter(([_, t]) => t.action === 'ignore')
    .map(([id, _]) => id.replace(/_/g, '.'));

  if (toAdd.length === 0 && toIgnore.length === 0) {{
    alert('No papers triaged yet. Use the buttons on each paper card.');
    return;
  }}

  const pending = {{
    digestDate: {json.dumps(digest_date)},
    savedAt: new Date().toISOString(),
    papers: toAdd,
    ignored: toIgnore
  }};

  const blob = new Blob([JSON.stringify(pending, null, 2)], {{ type: 'application/json' }});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pending_papers.json';
  a.click();
  URL.revokeObjectURL(a.href);

  alert('Saved ' + toAdd.length + ' paper(s) to add, ' + toIgnore.length + ' to ignore.\\n\\n' +
        'To import: open paper_database.html and click Import.');
}}
</script>
</body>
</html>"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"  HTML digest: {output_path}")
    return output_path


# ─── Email Digest ───

def _load_email_recipients():
    """Load recipient list from email_recipients.json, falling back to env vars."""
    recipients_file = os.path.join(BASE_DIR, "email_recipients.json")
    recipients = []
    try:
        with open(recipients_file, "r") as f:
            data = json.load(f)
        for r in data.get("recipients", []):
            if r.get("enabled", True):
                recipients.append({
                    "email": r["email"],
                    "name": r.get("name", ""),
                    "frequency": r.get("frequency", "daily"),
                })
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass
    # Fallback: use env var if no recipients file or no entries
    if not recipients and EMAIL_TO:
        recipients = [{"email": EMAIL_TO, "name": "", "frequency": "daily"}]
    return recipients


def send_email_digest(papers, digest_date, frequency="daily"):
    """Send a summary email with top papers and quick-action links."""
    if not EMAIL_FROM or not EMAIL_APP_PASSWORD:
        print("  Email skipped: set SCQ_EMAIL_FROM and SCQ_EMAIL_APP_PASSWORD env vars")
        print("  (Use a Gmail App Password: https://myaccount.google.com/apppasswords)")
        return False

    recipients = _load_email_recipients()
    # Filter by frequency (daily recipients get daily, weekly get weekly, "both" gets both)
    recipients = [r for r in recipients
                  if r["frequency"] == frequency or r["frequency"] == "both"]
    if not recipients:
        print(f"  No {frequency} email recipients configured")
        return False

    top_papers = [p for p in papers if p["relevance_score"] >= 5][:15]
    starred = [p for p in top_papers if p["relevance_score"] >= 20]

    # Build email body with quick-action links
    body_html = f"""
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <h2 style="color: #1a73e8;">SCQ arXiv Digest — {digest_date}</h2>
  <p style="color: #666;">{len(papers)} new papers, {len(starred)} high relevance, {len(top_papers)} total relevant.</p>
  <hr style="border: none; border-top: 1px solid #ddd;">
"""

    for p in top_papers:
        score = p["relevance_score"]
        color = "#2e7d32" if score >= 20 else ("#f57f17" if score >= 10 else "#757575")
        star_icon = "&#9733; " if score >= 20 else ""
        keywords = ", ".join(p["matched_keywords"][:4])
        body_html += f"""
  <div style="margin: 16px 0; padding: 12px; border-left: 3px solid {color}; background: #f8f9fa;">
    <div style="font-weight: 600; margin-bottom: 4px;">
      {star_icon}<a href="{p['abs_url']}" style="color: #1a73e8; text-decoration: none;">{p['title']}</a>
      <span style="color: {color}; font-size: 12px; font-weight: 700;">[{score}]</span>
    </div>
    <div style="font-size: 13px; color: #666; margin-bottom: 4px;">
      {p['short_authors']} &middot; {p['published'][:10]}
    </div>
    <div style="font-size: 12px; color: #888; margin-bottom: 6px;">Keywords: {keywords}</div>
    <div style="font-size: 12px;">
      <a href="{p['abs_url']}" style="color: #1a73e8; margin-right: 12px;">Abstract</a>
      <a href="{p['pdf_url']}" style="color: #1a73e8; margin-right: 12px;">PDF</a>
    </div>
  </div>
"""

    body_html += f"""
  <hr style="border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 13px; color: #555; text-align: center;">
    <b>Open the full digest HTML to triage papers</b> — add to reading list, star, ignore, and tag.<br>
    <span style="font-size: 11px; color: #999;">File: digests/digest_{digest_date}.html</span>
  </p>
  <p style="font-size: 11px; color: #999; text-align: center;">
    Categories: {', '.join(ARXIV_CATEGORIES)}<br>
    Manage recipients in paper_database.html Settings or email_recipients.json
  </p>
</div>
"""

    # Plain text fallback
    plain = f"SCQ arXiv Digest — {digest_date}\n"
    plain += f"{len(papers)} papers, {len(top_papers)} relevant\n\n"
    for p in top_papers:
        star = "★ " if p["relevance_score"] >= 20 else ""
        plain += f"{star}[{p['relevance_score']}] {p['title']}\n"
        plain += f"    {p['short_authors']} — {p['abs_url']}\n\n"
    plain += f"\nOpen digests/digest_{digest_date}.html to triage papers.\n"

    sent_count = 0
    for recipient in recipients:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"SCQ Digest: {len(top_papers)} relevant papers — {digest_date}"
        msg["From"] = EMAIL_FROM
        msg["To"] = recipient["email"]

        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(body_html, "html"))

        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(EMAIL_FROM, EMAIL_APP_PASSWORD)
                server.send_message(msg)
            print(f"  Email sent to {recipient['email']}")
            sent_count += 1
        except Exception as e:
            print(f"  Email to {recipient['email']} failed: {e}")

    return sent_count > 0


# ─── Mock Data for Testing ───

def generate_mock_papers():
    """Generate mock papers for testing when arXiv API is unavailable."""
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "2603.99001",
            "title": "Reduced Dielectric Loss in Tantalum-Based Superconducting Resonators via Surface Treatment",
            "authors": "A. Smith, B. Jones, C. Lee, D. Patel",
            "short_authors": "Smith et al.",
            "abstract": "We report a systematic study of dielectric loss in coplanar waveguide resonators fabricated from tantalum thin films. Through optimized surface treatment protocols including HF etching and vacuum annealing, we achieve internal quality factors exceeding 5 million at single-photon power levels. Our analysis using the loss tangent participation ratio framework identifies the metal-substrate interface as the dominant loss channel, with surface oxide contributions reduced by a factor of 3 compared to untreated samples. These results demonstrate a clear path toward improving transmon qubit coherence through materials engineering.",
            "published": now.isoformat(),
            "categories": ["cond-mat.supr-con", "quant-ph"],
            "pdf_url": "https://arxiv.org/pdf/2603.99001",
            "abs_url": "https://arxiv.org/abs/2603.99001",
        },
        {
            "id": "2603.99002",
            "title": "Fluxonium Qubit with T1 Exceeding 2 ms Using Granular Aluminum Superinductors",
            "authors": "E. Chen, F. Garcia, G. Kim",
            "short_authors": "Chen et al.",
            "abstract": "We demonstrate a fluxonium qubit achieving energy relaxation times T1 > 2 ms using superinductors fabricated from granular aluminum. The high kinetic inductance of grAl films enables compact superinductors with reduced participation in lossy interfaces. We characterize the coherence as a function of flux bias and identify quasiparticle tunneling as the limiting decoherence mechanism at the sweet spot. Our results establish granular aluminum as a promising platform for high-coherence superconducting qubits.",
            "published": now.isoformat(),
            "categories": ["quant-ph"],
            "pdf_url": "https://arxiv.org/pdf/2603.99002",
            "abs_url": "https://arxiv.org/abs/2603.99002",
        },
        {
            "id": "2603.99003",
            "title": "Quantum Error Correction with Surface Codes: A Scalability Analysis",
            "authors": "H. Wang, I. Martinez, J. Robinson",
            "short_authors": "Wang et al.",
            "abstract": "We present a comprehensive analysis of surface code scalability under realistic noise models. Using Monte Carlo simulations, we determine the threshold error rate for various decoder implementations and compare their computational overhead. Our results suggest that near-term quantum processors with gate fidelities above 99.5% can benefit from distance-3 surface codes for logical qubit demonstrations.",
            "published": now.isoformat(),
            "categories": ["quant-ph"],
            "pdf_url": "https://arxiv.org/pdf/2603.99003",
            "abs_url": "https://arxiv.org/abs/2603.99003",
        },
        {
            "id": "2603.99004",
            "title": "Two-Level System Defects in Amorphous Silicon Revealed by Microwave Spectroscopy",
            "authors": "K. Tanaka, L. Müller, M. Davis, N. Ivanov",
            "short_authors": "Tanaka et al.",
            "abstract": "We use superconducting microwave resonators as sensitive probes to characterize two-level system (TLS) defects in amorphous silicon thin films deposited under varying conditions. By measuring the power and temperature dependence of the internal quality factor, we extract the TLS loss tangent and spectral density for each film. Films deposited at higher substrate temperatures show a 5x reduction in TLS density, correlating with increased short-range order measured by electron diffraction. These findings inform the choice of dielectric materials for superconducting qubit fabrication.",
            "published": now.isoformat(),
            "categories": ["cond-mat.mtrl-sci", "quant-ph"],
            "pdf_url": "https://arxiv.org/pdf/2603.99004",
            "abs_url": "https://arxiv.org/abs/2603.99004",
        },
        {
            "id": "2603.99005",
            "title": "Machine Learning for Optimal Quantum Gate Calibration in Superconducting Processors",
            "authors": "O. Park, P. Nguyen",
            "short_authors": "Park & Nguyen",
            "abstract": "We develop a machine learning approach for automated calibration of single and two-qubit gates in superconducting quantum processors. Using Bayesian optimization with a Gaussian process surrogate model, we reduce the calibration time by 10x while achieving gate fidelities comparable to manual tuning. The method is demonstrated on a 5-qubit transmon processor with cross-resonance gates.",
            "published": now.isoformat(),
            "categories": ["quant-ph"],
            "pdf_url": "https://arxiv.org/pdf/2603.99005",
            "abs_url": "https://arxiv.org/abs/2603.99005",
        },
        {
            "id": "2603.99006",
            "title": "Topological Insulator Thin Films on Sapphire Substrates: Growth and Characterization",
            "authors": "Q. Brown, R. Wilson",
            "short_authors": "Brown & Wilson",
            "abstract": "We report the molecular beam epitaxy growth of Bi2Se3 thin films on c-plane sapphire substrates. X-ray diffraction and atomic force microscopy confirm high crystalline quality with RMS roughness below 1 nm. Transport measurements reveal surface-dominated conduction at temperatures below 50K.",
            "published": now.isoformat(),
            "categories": ["cond-mat.mtrl-sci"],
            "pdf_url": "https://arxiv.org/pdf/2603.99006",
            "abs_url": "https://arxiv.org/abs/2603.99006",
        },
    ]


# ─── Weekend Smart Lookback ───

def compute_effective_days_back(days_back):
    """
    arXiv does not post papers on Saturday or Sunday.  When a manual run is
    triggered on a weekend with days_back=1 (the "give me today's papers"
    default), there is nothing to find.  This function detects that situation
    and extends the window just enough to reach back to the most recent Friday.

    Returns (effective_days_back, adjustment_note):
      - effective_days_back: the adjusted integer to pass to fetch_arxiv_papers
      - adjustment_note:     a human-readable string, or None if no change was made
    """
    now = datetime.now(timezone.utc)
    weekday = now.weekday()   # Monday=0 … Sunday=6

    if weekday == 5:          # Saturday — Friday was yesterday
        extra = 1
    elif weekday == 6:        # Sunday — Friday was two days ago
        extra = 2
    else:
        return days_back, None   # weekday, no change needed

    # Only auto-extend the single-day window.  If the user explicitly asked
    # for --days 7 on a weekend, honour that; they know what they want.
    if days_back == 1:
        adjusted = days_back + extra
        day_name = "Saturday" if weekday == 5 else "Sunday"
        note = (
            f"Weekend detected ({day_name}): arXiv doesn't post on weekends. "
            f"Extending lookback from 1 → {adjusted} days to capture Friday's papers."
        )
        return adjusted, note

    return days_back, None


# ─── Main ───

def main():
    parser = argparse.ArgumentParser(description="SCQ arXiv Daily Digest")
    parser.add_argument("--days", type=int, default=3, help="Days to look back (default: 3)")
    parser.add_argument("--no-email", action="store_true", help="Skip email, generate HTML only")
    parser.add_argument("--test", action="store_true", help="Use mock data (no network)")
    parser.add_argument("--max-results", type=int, default=200, help="Max papers per category")
    parser.add_argument(
        "--smart-weekend", action="store_true",
        help="Auto-extend lookback on weekends so Friday's papers are not missed"
    )
    args = parser.parse_args()

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
        papers = fetch_arxiv_papers(ARXIV_CATEGORIES, days_back=days_back, max_results=args.max_results)

    if not papers:
        print("\nNo new papers found.")
        return

    # Rank by relevance
    print(f"\nRanking {len(papers)} papers...")
    papers = rank_papers(papers)

    relevant = sum(1 for p in papers if p["relevance_score"] >= 5)
    print(f"  {relevant} papers match SCQ keywords")

    # Generate HTML digest
    print("\nGenerating digest...")
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
