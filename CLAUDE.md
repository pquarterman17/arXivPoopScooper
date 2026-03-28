# SCQ Paper Database — Claude Session Guide

This is a scientific literature management system for superconducting quantum computing (SCQ) research. It runs as static HTML files with a SQLite database (base64-encoded in `scq_data.js` for file:// protocol compatibility).

## Adding a Paper from arXiv

This is the most common task. It's a two-step pipeline.

### Step 1: Fetch (runs on host machine via Desktop Commander)

The Cowork sandbox cannot reach arxiv.org. Use Desktop Commander to run the fetch script on the user's actual machine.

**Windows:**
```
C:\Users\patri\AppData\Local\Temp\run_fetch.bat <arxiv_id>
```
> Note: `run_fetch.bat` is a wrapper at the above path that handles Windows path quoting.
> The actual script lives at `tools/fetch_arxiv.js`. If `run_fetch.bat` doesn't exist,
> create it with: `"C:\Program Files\nodejs\node.exe" "<project_path>\tools\fetch_arxiv.js" %*`

**macOS/Linux:**
```
bash tools/fetch.sh <arxiv_id>
```

**What it does:** Queries the arXiv API for metadata, downloads the PDF to `papers/`, and saves a JSON file to `inbox/<arxiv_id>_meta.json`.

**Desktop Commander tips:**
- Use `shell: "cmd"` on Windows to capture output (PowerShell swallows stdout)
- Paths with spaces need a .bat wrapper on Windows — don't try to quote them inline
- The script is pure Node.js (`fetch_arxiv.js`) and is cross-platform

### Step 2: Process (runs in the Cowork sandbox)

```bash
cd "/sessions/jolly-awesome-faraday/mnt/References - Claude v0p1 Build"
python3 tools/process_paper.py <arxiv_id> --note "optional note"
```

**What it does (all automatic):**
1. Reads `inbox/<arxiv_id>_meta.json`
2. Extracts figures + captions from the PDF via `tools/extract_figures.py`
3. Generates BibTeX and plain-text (Physical Review style) citations
4. Auto-tags based on arXiv categories + keyword matching
5. Inserts into SQLite: paper entry, figures, FTS index, read status
6. Appends to `references.bib` and `references.txt` (with duplicate detection)
7. Re-exports the DB to `scq_data.js`

**What it leaves for Claude to enrich interactively:**
- Summary (defaults to the abstract, truncated)
- Key results (empty by default)
- Group name (empty by default)
- The user may ask you to read the paper and fill these in

### Enriching a Paper

After `process_paper.py` runs, the user may ask you to fill in the summary, key results, and group name. To do this:

1. Read the PDF: `papers/<arxiv_id>_<Author>_<ShortTitle>.pdf`
2. Write a 2-3 sentence summary focused on what was done and why it matters
3. Extract 3-5 key results as a JSON array of strings
4. Identify the research group (e.g., "de Leon (Princeton)", "Ali (TU Delft)")
5. Update the DB:
```python
import sqlite3, json, re, base64
# Decode DB from scq_data.js → temp file → sqlite3 connect
# UPDATE papers SET summary=?, key_results=?, group_name=? WHERE id=?
# Re-export: base64 encode → write scq_data.js
```

## File Structure

```
References - Claude v0p1 Build/
├── paper_database.html      Main app: Library + Reading List + Cite tabs
├── paper_scraper.html       Paper scraper: Search + Inbox + Quick Search tabs
├── [LEGACY] cite_helper.html    Absorbed into paper_database.html Cite tab
├── [LEGACY] to_read.html        Absorbed into paper_database.html Reading List tab
├── [LEGACY] arxiv_search.html   Absorbed into paper_scraper.html Quick Search tab
├── scq_data.js              SQLite DB as base64 (THE canonical data source)
├── db_utils.js              Shared sql.js utility layer for HTML pages
├── scraper_config.js        Domain-specific config (search presets, tags)
├── references.bib           BibTeX citations
├── references.txt           Plain-text citations (Physical Review style)
├── notes.json               Legacy state backup
├── papers/                  PDFs: <arXivId>_<Author>_<ShortTitle>.pdf
├── figures/                 Extracted figures by arXiv ID
│   └── <arXivId>/           fig1.jpg, fig2.jpg, ..., captions.json
├── inbox/                   Staging area for _meta.json files
├── tools/
│   ├── fetch_arxiv.js       Node.js: arXiv API + PDF download (host machine)
│   ├── fetch.bat            Windows wrapper for fetch_arxiv.js
│   ├── fetch.sh             macOS/Linux wrapper for fetch_arxiv.js
│   ├── process_paper.py     Full step-2 pipeline (sandbox)
│   ├── extract_figures.py   PyMuPDF figure + caption extractor
│   ├── process_inbox.py     Batch PDF inbox processor
│   ├── import_mendeley.py   .bib file importer
│   ├── init_database.py     DB schema creator / migration tool
│   └── merge_database.py    DB merge utility
├── CLAUDE.md                This file
├── FEATURES.md              Full feature documentation
└── README.txt               Quick overview
```

## Database Schema (key tables)

- **papers** — id (arXiv ID), title, authors, short_authors, year, tags (JSON array), summary, key_results (JSON array), cite_bib, cite_txt, pdf_path, group_name, date_added
- **figures** — paper_id, figure_key, file_path, label, caption, sort_order
- **notes** — paper_id, content, last_edited
- **read_status** — paper_id, is_read, priority (0-3 stars)
- **collections** — name, paper_id
- **papers_fts** — FTS5 full-text search index over papers

The DB lives in `scq_data.js` as a base64-encoded SQLite file. To work with it:

```python
import sqlite3, re, base64
with open('scq_data.js') as f:
    content = f.read()
match = re.search(r'const SCQ_DB_BASE64 = "([^"]+)"', content)
db_bytes = base64.b64decode(match.group(1))
with open('.scq_tmp.db', 'wb') as f:
    f.write(db_bytes)
conn = sqlite3.connect('.scq_tmp.db')
# ... do work ...
conn.close()
# Re-export:
with open('.scq_tmp.db', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('ascii')
with open('scq_data.js', 'w') as f:
    f.write('// Auto-generated database bootstrap\n')
    f.write(f'const SCQ_DB_BASE64 = "{b64}";\n')
```

## Platform Notes

| | Windows PC | MacBook |
|---|---|---|
| Node.js path | `C:\Program Files\nodejs\node.exe` | `node` (in PATH) |
| Fetch wrapper | `fetch.bat` (or `run_fetch.bat` in Temp) | `bash tools/fetch.sh` |
| DC shell | Use `shell: "cmd"` (PowerShell eats stdout) | Default shell works |
| Workspace path | `C:\Users\patri\OneDrive\Work and School Research\References - Claude v0p1 Build` | TBD — depends on OneDrive/iCloud sync setup |
| Python (sandbox) | Always Linux sandbox — same on both | Same |

## arXiv API Connectivity

The browser-based scraper/database need to reach the arXiv API. This is handled via a
local proxy in `serve.py` that avoids CORS and sets a proper User-Agent header:

- **serve.py** exposes `/api/arxiv?<query>` which forwards to `https://arxiv.org/api/query?<query>`
- Both `paper_scraper.html` and `paper_database.html` auto-detect localhost and route
  through the proxy. Falls back to CORS proxies (allorigins, corsproxy.io) then direct fetch.
- `export.arxiv.org` is **unreachable** from the user's network (Fastly CDN routing issue).
  All code uses `arxiv.org` instead. Do NOT switch back to `export.arxiv.org`.
- If 429 rate-limit errors occur, wait a few minutes between searches.

## Common Tasks Quick Reference

**Add paper:** fetch.bat/sh → process_paper.py → (optional) enrich summary/results
**Add note:** Update `notes` table in DB, re-export scq_data.js
**Change tags:** Update `tags` JSON in `papers` table, re-export
**Bulk import:** Use `tools/import_mendeley.py` for .bib files, or `tools/process_inbox.py` for PDFs
**Search papers:** Use the FTS5 index: `SELECT * FROM papers_fts WHERE papers_fts MATCH 'tantalum'`
