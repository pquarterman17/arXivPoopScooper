# ScientificLitterScoop

Customizable arXiv scraper, which integrates intoa  local reference database.
Interests can be customized, sends daily email of newly posted manuscripts
ranked by algorithmically calculated interests.

It runs as two HTML pages served by a small Python script, backed by a
SQLite database. No build step, no cloud account, no telemetry — just a
folder you can back up with `cp -r`.

> **Status:** the codebase is mid-refactor from two monolithic HTML
> files into layered ES modules + a Python package. Production still
> runs on the legacy entry points; new work goes into `src/services/`
> and `src/ui/`. See `plans/architecture-refactor.md`.

---

## Features

- **One-shot arXiv ingest** — give the toolkit an arXiv ID and it
  fetches metadata, downloads the PDF, extracts figures + captions,
  generates BibTeX and Physical Review-style citations, auto-tags from
  the abstract, and inserts into the database.
- **Browser UI** — search, filter by tag/collection, read figures and
  notes side-by-side with the PDF, copy citations for Word, manage a
  reading list with priority stars.
- **Collections + exports** — group papers, export `.bib`, `.txt`, or
  `.json` for LaTeX projects.
- **Daily arXiv digest** (optional) — a GitHub Actions workflow emails
  a daily summary of new papers in chosen categories.
- **Hot-editable config** — search sources, auto-tag rules, citation
  styles, digest cadence, and watchlists live in JSON files validated
  against shared JSON Schemas.

---

## Quick start

### Prerequisites

- Python **3.11+**
- Node.js (only for the arXiv fetch script — used to download PDFs)
- A modern browser

### Install

```bash
git clone https://github.com/pquarterman17/ScientificLitterScoop.git
cd ScientificLitterScoop
pip install -e .
scq init             # create a fresh local database
```

The database lives at `data/scientific_litter_scoop.db` by default. Override with
`SCQ_DB_PATH` or `data/user_config/paths.toml`.

### Launch

**Windows:**
```
START.bat
```

**macOS / Linux:**
```bash
python -m scq.server   # or: python serve.py
```

Then open <http://localhost:8000/paper_database.html>.

### Add a paper

```bash
# Step 1 — fetch from arXiv (runs on the host machine)
bash tools/fetch.sh 2401.12345          # macOS / Linux
tools\fetch.bat 2401.12345              # Windows

# Step 2 — process into the database
python tools/process_paper.py 2401.12345
```

That's it. Reload the database page to see the paper.

---

## Repository layout

```
ScientificLitterScoop/
├── data/
│   ├── scientific_litter_scoop.db            # canonical SQLite database (gitignored)
│   ├── migrations/              # versioned schema (NNN_*.sql)
│   └── user_config/             # user overrides (gitignored, .example committed)
├── src/                         # frontend ES modules (no build step)
│   ├── core/                    # framework-agnostic plumbing
│   ├── services/                # DOM-free domain logic
│   ├── config/                  # ship-defaults + JSON schemas
│   ├── ui/                      # DOM-coupled rendering
│   └── tests/                   # vitest specs
├── scq/                         # Python package (CLI, config, db, ingest)
├── tools/                       # legacy Python scripts (moving into scq/)
├── tests/                       # pytest suite
├── papers/                      # PDFs (gitignored — local cache)
├── figures/                     # extracted figures (gitignored)
└── inbox/                       # arXiv fetch staging (gitignored)
```

For full architecture detail, see `CLAUDE.md` and `FEATURES.md`.

---

## Configuration

Three layers, in priority order:

| Layer | Where | Editable how |
|---|---|---|
| Bootstrap (paths) | `data/user_config/paths.toml` or `SCQ_*` env vars | Hand-edit |
| Domain (search, digest, citations, …) | `data/user_config/<domain>.json` | Hand-edit; validated against `src/config/schema/` |
| Session UI prefs | `settings` table in the DB | Settings UI |
| Secrets (SMTP, API tokens) | OS keyring (Windows Credential Manager / macOS Keychain) or env vars | `scq config set-secret <name>` |

Inspect resolved config:

```bash
scq config show          # all domains as JSON
scq config show digest   # one domain
scq config paths         # resolved filesystem paths
scq config validate      # schema-check every domain
```

Starter `.example` files for each domain ship in `data/user_config/`.

---

## Development

```bash
# Python
pip install -e ".[dev]"
pytest
ruff check scq/

# Frontend
npm install
npm test                 # vitest
```

CI runs `pytest` + `vitest` on every push to `main` and every PR (see
`.github/workflows/test.yml`).

---

## Contributing

This is a personal research tool, but bug reports and pull requests are
welcome. See `SECURITY.md` for vulnerability disclosure and
`CODE_OF_CONDUCT.md` for community guidelines.

---

## License

MIT — see `LICENSE`.
