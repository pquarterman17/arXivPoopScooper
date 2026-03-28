# SCQ Paper Database

A lightweight, browser-based literature management system for superconducting quantum computing research. No server, no build tools, no frameworks — just static HTML files backed by a SQLite database.

Inspired by Mendeley circa 2017: powerful enough to be useful, simple enough to not get in the way.

## Quick Start

**Double-click `START.bat`** (Windows) or run `python serve.py` (macOS/Linux). This starts a local server and opens the database in your browser automatically. Close the terminal window to stop the server.

> **Why a server?** The app uses sql.js (WASM-based SQLite). Browsers block WASM loading from `file://` URLs, so a lightweight localhost server is needed. `serve.py` also provides an arXiv API proxy that avoids CORS issues when searching.

To add a paper from arXiv:

1. Run the fetch script on your machine:
   ```bash
   # Windows
   tools\fetch.bat 2603.17921

   # macOS/Linux
   bash tools/fetch.sh 2603.17921
   ```
2. Run the processing pipeline (requires Python 3 + PyMuPDF):
   ```bash
   python3 tools/process_paper.py 2603.17921
   ```
3. Refresh the page. Your paper is there with figures, citations, and auto-generated tags.

## What It Does

### Paper Database (`paper_database.html`)

The main app has three tabs:

**Library** — Browse, search, and manage your paper collection. Cards view shows expandable entries with summaries, key results, extracted figures with lightbox, personal notes, highlights, and related papers. Table view offers sortable columns with inline cite buttons. Cite view lists all citations with bulk export.

**Reading List** — Unread papers grouped by date (this week / this month / older), sorted by priority stars. One-click "mark as read" to clear items as you go.

**Cite** — Multi-select citation picker designed for writing. Toggle between Word/plain-text and BibTeX formats. Live preview panel. Keyboard shortcuts: `/` to search, `Ctrl+C` to copy selection.

Other features: collections with .bib export, tag management (rename/merge/delete), inline PDF viewer panel, annotation highlights with page references, auto-fetch of new papers from saved queries, star ratings (1-3), full-text PDF search via FTS5.

### Paper Scraper (`paper_scraper.html`)

Discovers new papers across multiple sources:

**Search** — Query arXiv and Physical Review journals simultaneously. Source toggles filter by publication venue. Preset buttons for common SCQ topics. Batch-select results and stage them for review.

**Inbox** — Review staged papers before committing to the database. Add notes, verify tags, approve or dismiss individually or in bulk.

**Quick Search** — Lightweight standalone arXiv search. Select papers and export as JSON for batch import via Claude or the processing pipeline.

## Architecture

```
paper_database.html  ──┐
paper_scraper.html   ──┼── db_utils.js ── scq_data.js (base64-encoded SQLite)
                       │
                       └── scraper_config.js (domain-specific config)
```

The database lives in `scq_data.js` as a base64-encoded SQLite file, loaded via [sql.js](https://github.com/sql-js/sql.js/) WASM. A lightweight local server (`serve.py`) serves the files over localhost and provides an arXiv API proxy — launch it with `START.bat` or `python serve.py`. All database operations go through `db_utils.js`, which provides a shared API (`SCQ.init()`, `SCQ.getAllPapers()`, `SCQ.setNote()`, etc.).

Domain-specific configuration — search presets, auto-tag keywords, journal sources, arXiv categories — lives in `scraper_config.js`. Change this single file to adapt the system for a different research area.

## File Structure

```
├── START.bat              Double-click to launch (Windows)
├── serve.py               Local server + arXiv API proxy
├── paper_database.html    Main app (Library + Reading List + Cite)
├── paper_scraper.html     Paper discovery (Search + Inbox + Quick Search)
├── scq_data.js            SQLite DB as base64 (canonical data source)
├── db_utils.js            Shared sql.js utility layer
├── scraper_config.js      Domain config (presets, tags, sources)
├── references.bib         BibTeX citations
├── references.txt         Plain-text citations (Physical Review style)
├── papers/                PDFs: <arXivId>_<Author>_<ShortTitle>.pdf
├── figures/               Extracted figures organized by arXiv ID
│   └── <arXivId>/         fig1.jpg, fig2.jpg, ..., captions.json
├── inbox/                 Staging area for fetch script metadata
└── tools/
    ├── fetch_arxiv.js     arXiv API + PDF download (Node.js)
    ├── fetch.bat           Windows wrapper
    ├── fetch.sh            macOS/Linux wrapper
    ├── process_paper.py    Full ingestion pipeline (Python)
    ├── extract_figures.py  PyMuPDF figure + caption extractor
    ├── process_inbox.py    Batch PDF inbox processor
    ├── import_mendeley.py  .bib file importer (Mendeley/Zotero)
    ├── init_database.py    DB schema creator / migration tool
    └── merge_database.py   DB merge utility
```

## Database Schema

The SQLite database has these key tables:

| Table | Purpose |
|-------|---------|
| `papers` | Core paper data: id, title, authors, year, tags, summary, key_results, citations, group_name |
| `figures` | Extracted figures with captions, keyed by paper_id |
| `notes` | Per-paper notes with timestamps |
| `read_status` | Read/unread flag + priority (0-3 stars) |
| `collections` | Named paper groups (e.g., "Dissertation Ch.3") |
| `paper_links` | Manual bidirectional links between related papers |
| `highlights` | Annotation highlights with page references |
| `papers_fts` | FTS5 full-text search index |

## Customizing for Your Field

Edit `scraper_config.js` to adapt the system for any research area:

1. Change `name` and `description` to match your field
2. Replace `presets` with common searches in your area
3. Replace `tags` with keyword-to-tag mappings for your domain
4. Adjust `sources` to enable/disable journal feeds
5. Optionally tune `autoFetch` timing

Everything else — UI, database, search, citations — works automatically.

## Tools

| Script | Runtime | Purpose |
|--------|---------|---------|
| `fetch_arxiv.js` | Node.js | Download metadata + PDF from arXiv |
| `process_paper.py` | Python 3 | Full pipeline: figures, citations, DB insert, auto-tag |
| `extract_figures.py` | Python 3 | Extract figures + captions from PDFs (PyMuPDF) |
| `import_mendeley.py` | Python 3 | Import .bib files from Mendeley/Zotero/Scholar |
| `process_inbox.py` | Python 3 | Batch process PDFs dropped in `inbox/` |
| `init_database.py` | Python 3 | Create/migrate the SQLite database schema |
| `merge_database.py` | Python 3 | Merge another lab member's .db into yours |

## Dependencies

**Browser**: Any modern browser (Chrome, Firefox, Edge, Safari). Uses [sql.js](https://github.com/sql-js/sql.js/) WASM loaded from CDN.

**Fetch script**: Node.js (for `fetch_arxiv.js`)

**Processing pipeline**: Python 3 with PyMuPDF (`pip install PyMuPDF`)

## Collaboration

The database can be shared between lab members:

- **Export/Import**: Save database button downloads a `.db` file; import button restores it
- **Merge**: "Merge .db" button combines another lab member's database with yours (new papers added, existing ones updated, nothing lost)
- **Collection sharing**: Export a collec