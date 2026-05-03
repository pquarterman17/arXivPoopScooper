# ScientificLitterScoop — Claude Session Guide

This is a scientific literature management system for superconducting quantum computing (SCQ) research. It runs as two HTML pages served via a local Python server (`scq/server.py`, launched via `python -m scq serve` or by double-clicking `START.bat`), backed by a SQLite database (`data/scientific_litter_scoop.db`, served directly via HTTP and loaded into the browser by sql.js).

> Naming note: the project lives at `github.com/pquarterman17/ScientificLitterScoop`. User-facing branding says "ScientificLitterScoop"; internal docs and code may still say "SCQ" since the *research domain* (superconducting quantum computing) is unchanged. The Python package is `scq` and the env-var prefix is `SCQ_` — don't rename those. The database file was renamed from `scq_papers.db` to `scientific_litter_scoop.db` in 2026-05-01 to match the public-facing project name.

> **Refactor in progress (2026-04-28+):** the codebase is being decomposed
> from two monolithic HTML files into layered ES modules under `src/` plus a
> Python package under `scq/`. See `plans/architecture-refactor.md` for the
> tier list. The legacy `paper_database.html`, `paper_scraper.html`,
> `db_utils.js`, and `scraper_config.js` still drive production until items
> #8 / #9 land — don't extend them with new features. Add new functionality
> to `src/services/*` (DOM-free) or `src/ui/*` (DOM-coupled) instead.

## Custom Skills

Four project-specific skills are available in `.claude/skills/`. Use them instead of working from scratch:

| Skill | When to use |
|---|---|
| **add-paper** | User gives you an arXiv ID or URL. Handles fetch → process → offer enrichment. |
| **enrich-paper** | Read a paper's PDF and fill in summary, key results, research group. |
| **db-maintenance** | Delete papers, update tags, edit notes, manage collections, fix citations. |
| **literature-review** | Synthesize papers on a topic into a structured field overview. |

These skills contain ready-to-use code snippets, the DB access pattern, and domain-specific guidance. Always check them first before writing database code from scratch.

## Adding a Paper from arXiv

This is the most common task. It's a two-step pipeline. See the **add-paper** skill for full details.

### Step 1: Fetch (runs on host machine via Desktop Commander)

The Cowork sandbox cannot reach arxiv.org. Use Desktop Commander to run the fetch script on the user's actual machine.

**Windows:**
```
%TEMP%\run_fetch.bat <arxiv_id>
```
> Note: `run_fetch.bat` is a wrapper in `%TEMP%` that handles Windows path quoting.
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
cd "$PROJECT_ROOT"
python3 tools/process_paper.py <arxiv_id> --note "optional note"
```

Find `PROJECT_ROOT` dynamically:
```bash
PROJECT_ROOT=$(find /sessions -name "scientific_litter_scoop.db" -path "*/mnt/*/data/*" 2>/dev/null | head -1 | xargs dirname | xargs dirname)
```

**What it does (all automatic):**
1. Reads `inbox/<arxiv_id>_meta.json`
2. Extracts figures + captions from the PDF via `tools/extract_figures.py`
3. Generates BibTeX and plain-text (Physical Review style) citations
4. Auto-tags based on arXiv categories + keyword matching
5. Inserts into SQLite: paper entry, figures, FTS index, read status
6. Appends to `references.bib` and `references.txt` (with duplicate detection)

The DB at `data/scientific_litter_scoop.db` is the canonical store; the browser fetches
it directly via HTTP and reads it with sql.js. There is no re-export step.

### Enriching a Paper

See the **enrich-paper** skill for full instructions. In short:

1. Read the PDF: `papers/<arxiv_id>_<Author>_<ShortTitle>.pdf`
2. Write a 2-3 sentence summary focused on what was done and why it matters
3. Extract 3-5 key results as a JSON array of strings
4. Identify the research group (e.g., "de Leon (Princeton)", "Ali (TU Delft)")
5. Update the DB at `data/scientific_litter_scoop.db` (no re-export step needed)

## File Structure

The project is split between two OneDrive locations (paths shown below
are examples — the actual values depend on your username and OneDrive
mount). On macOS the equivalents live under
`~/Library/CloudStorage/OneDrive-*` or wherever you sync OneDrive.
- **Code repo:** `<OneDrive>\Coding\git\ScientificLitterScoop\` — only code, configs, docs, and tests. No PDFs, no figures, no DB, no citations, no digests.
- **Paper library (all user data):** `<OneDrive>\Work and School Research\SCQ Paper Library\`
  - `papers/`, `figures/`, `inbox/` — surfaced in the repo via Windows directory junctions
  - `database/scientific_litter_scoop.db` — the SQLite database (resolver: `paths.db_path`)
  - `citations/references.bib`, `citations/references.txt` — BibTeX + plain-text citations (resolver: `paths.references_bib_path` / `references_txt_path`)
  - `digests/digest_YYYY-MM-DD.html` — daily arXiv-digest reports (resolver: `paths.digests_dir`)
- The repo's `data/user_config/paths.toml` (gitignored) maps each name above to its OneDrive absolute path. New machines copy `paths.toml.example`, edit, and the resolver picks up the override.

```
ScientificLitterScoop/
├── START.bat                Double-click to launch (Windows)
├── scq/server.py            Local server + arXiv API proxy + no-cache headers (renamed from serve.py 2026-05-03)
├── paper_database.html      Legacy main app (Library/Reading List/Cite/Settings)
├── paper_scraper.html       Legacy scraper (Search/Inbox/Quick Search)
├── db_utils.js              Legacy sql.js IIFE — superseded by src/core/db.js
├── scraper_config.js        Legacy giant config object — superseded by src/config/
├── (references.bib + .txt)  → SCQ Paper Library/citations/ (external; see paths.toml)
├── data/
│   ├── scientific_litter_scoop.db    Canonical SQLite database (served via HTTP)
│   ├── migrations/          Versioned schema (001_initial.sql, etc.)
│   └── user_config/         User overrides (gitignored) + .example starters
├── src/                     New layered frontend (no build step, ES modules)
│   ├── core/                  db, store, events, config — DOM-free
│   ├── services/              papers/notes/tags/citations/arxiv/etc — DOM-free
│   ├── config/                schemas + ship-defaults
│   ├── ui/                    DOM-coupled (filling in via items #8 / #9)
│   └── tests/                 vitest specs (run with `npm test`)
├── scq/                     Python package (paths.py/migrations etc.)
├── papers/                  [Junction → SCQ Paper Library\papers] PDFs: <arXivId>_<Author>_<ShortTitle>.pdf
├── figures/                 [Junction → SCQ Paper Library\figures] Extracted figures by arXiv ID
│   └── <arXivId>/           fig1.jpg, fig2.jpg, ..., captions.json
├── inbox/                   [Junction → SCQ Paper Library\inbox] Staging area for _meta.json files
├── tools/                   Python tools (will move into scq/ via plan item #12)
│   ├── fetch_arxiv.js       Node.js: arXiv API + PDF download (host machine)
│   ├── fetch.bat            Windows wrapper for fetch_arxiv.js
│   ├── fetch.sh             macOS/Linux wrapper for fetch_arxiv.js
│   ├── process_paper.py     Full step-2 pipeline (sandbox)
│   ├── extract_figures.py   PyMuPDF figure + caption extractor
│   ├── process_inbox.py     Batch PDF inbox processor
│   ├── import_mendeley.py   .bib file importer
│   ├── init_database.py     DB schema creator (legacy; use scq.db.migrations)
│   └── merge_database.py    DB merge utility
├── plans/                   Local-only working plans (gitignored)
├── .claude/skills/          Project-specific Claude skills
│   ├── add-paper/           Full arXiv → DB pipeline
│   ├── enrich-paper/        PDF → summary/results/group
│   ├── db-maintenance/      CRUD operations on the database
│   └── literature-review/   Synthesize papers into field overviews
├── LICENSE                  MIT
├── SECURITY.md              Vulnerability disclosure policy
├── CLAUDE.md                This file
├── FEATURES.md              Full feature documentation
├── README.md                Quick overview
├── CODE_OF_CONDUCT.md       Contributor Covenant 2.1
└── pyproject.toml           Python package config
```

## Database Schema (key tables)

- **papers** — id (arXiv ID), title, authors, short_authors, year, tags (JSON array), summary, key_results (JSON array), cite_bib, cite_txt, pdf_path, group_name, date_added
- **figures** — paper_id, figure_key, file_path, label, caption, sort_order
- **notes** — paper_id, content, last_edited
- **read_status** — paper_id, is_read, priority (0-3 stars)
- **collections** — name, paper_id
- **settings** — key, value (JSON) — stores user preferences like sources/presets
- **papers_fts** — FTS5 full-text search index over papers

The DB is `data/scientific_litter_scoop.db`, a regular SQLite file. To work with it from Python:

```python
import sqlite3, glob

# Find the repo root dynamically (sandbox or local)
matches = glob.glob("/sessions/*/mnt/*/data/scientific_litter_scoop.db")
DB = matches[0] if matches else "data/scientific_litter_scoop.db"

conn = sqlite3.connect(DB)
conn.execute("PRAGMA foreign_keys = ON")
# ... do work ...
conn.commit()
conn.close()
```

The `scq.db.connection` helper (in `scq/db/connection.py`) does this for you and resolves the path from `data/user_config/paths.toml` if it exists. The legacy `scq_data.js` base64 bootstrap was retired in commit `c3694d1`.

## Platform Notes

| | Windows PC | MacBook |
|---|---|---|
| Node.js path | `C:\Program Files\nodejs\node.exe` | `node` (in PATH) |
| Fetch wrapper | `fetch.bat` (or `run_fetch.bat` in Temp) | `bash tools/fetch.sh` |
| DC shell | Use `shell: "cmd"` (PowerShell eats stdout) | Default shell works |
| Code path | `<OneDrive>\Coding\git\ScientificLitterScoop` | `~/Library/CloudStorage/OneDrive-*/Coding/git/ScientificLitterScoop` (or wherever you sync) |
| Data path | `<OneDrive>\Work and School Research\SCQ Paper Library` (junctioned into the repo as `papers/`, `figures/`, `inbox/`) | Equivalent OneDrive path on the Mac side |
| Python (sandbox) | Always Linux sandbox — same on both | Same |

## arXiv API Connectivity

The browser-based scraper/database need to reach the arXiv API. This is handled via a
local proxy in `scq/server.py` that avoids CORS and sets a proper User-Agent header:

- **scq/server.py** exposes `/api/arxiv?<query>` which forwards to `https://arxiv.org/api/query?<query>`
- Both `paper_scraper.html` and `paper_database.html` auto-detect localhost and route
  through the proxy. Falls back to CORS proxies (allorigins, corsproxy.io) then direct fetch.
- `export.arxiv.org` is **unreachable** from the user's network (Fastly CDN routing issue).
  All code uses `arxiv.org` instead. Do NOT switch back to `export.arxiv.org`.
- If 429 rate-limit errors occur, wait a few minutes between searches.

## Common Tasks Quick Reference

**Add paper:** Use the `add-paper` skill, or manually: fetch.bat/sh → process_paper.py → enrich
**Enrich paper:** Use the `enrich-paper` skill to read PDF and fill summary/results/group
**Add note:** Use `db-maintenance` skill, or: update `notes` table, then `conn.commit()` (no re-export — the .db is canonical)
**Change tags:** Use `db-maintenance` skill, or: update `tags` JSON in `papers` table, then `conn.commit()`
**Literature review:** Use the `literature-review` skill to synthesize papers on a topic
**Bulk import:** Use `tools/import_mendeley.py` for .bib files
**DB migration:** Use `tools/init_database.py` to create/update schema
