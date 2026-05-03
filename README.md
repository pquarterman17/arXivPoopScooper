# ScientificLitterScoop

Customizable arXiv scraper, which integrates intoa  local reference database.
Interests can be customized, sends daily email of newly posted manuscripts
ranked by algorithmically calculated interests.

It runs as two HTML pages served by a small Python script, backed by a
SQLite database. No build step, no cloud account, no telemetry — just a
folder you can back up with `cp -r`.

> **Status:** the layered architecture is in place. Frontend is split
> into `src/core/` (DOM-free), `src/services/` (DOM-free), and
> `src/ui/<page>/` (DOM-coupled); Python tooling lives under the `scq/`
> package. Architecture deep-dives in [`docs/`](docs/README.md).

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
python -m scq serve     # or double-click START.command
```

Then open <http://localhost:8080/paper_database.html>.

### Add a paper

```bash
# Step 1 — fetch from arXiv (runs on the host machine)
bash tools/fetch.sh 2401.12345          # macOS / Linux
tools\fetch.bat 2401.12345              # Windows

# Step 2 — process into the database
scq process 2401.12345
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
│   ├── dev/                     # storybook-style harness for ui/ modules
│   └── tests/                   # vitest specs
├── scq/                         # Python package — server, cli, config,
│                                #   db, arxiv, ingest, overleaf, search,
│                                #   schedule, migrate
├── tools/                       # thin compat shims that delegate to scq/
├── tests/                       # pytest suite
├── docs/                        # architecture + how-to deep dives
├── papers/                      # PDFs (gitignored — local cache)
├── figures/                     # extracted figures (gitignored)
└── inbox/                       # arXiv fetch staging (gitignored)
```

For deeper detail, start with [`docs/architecture.md`](docs/architecture.md). The
[GitHub wiki](https://github.com/pquarterman17/ScientificLitterScoop/wiki) has
project-level guidance for new contributors.

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
pytest                   # 325 specs as of 2026-05-03
ruff check scq/

# Frontend
npm install
npm test                 # vitest — 595 specs
npm run typecheck        # tsc --noEmit on @ts-check-opted-in files
npm run build            # vite production bundle (optional, dist/)
```

CI runs vitest + pytest + typecheck + an end-to-end smoke job that
spins up `scq serve` and hits a representative slice of endpoints — see
`.github/workflows/test.yml`.

For iterating on individual UI modules without booting the full app,
visit `http://localhost:8080/dev.html` after starting the server. Stories
live in `src/dev/stories/`.

---

## Contributing

This is a personal research tool, but bug reports and pull requests are
welcome. See `SECURITY.md` for vulnerability disclosure and
`CODE_OF_CONDUCT.md` for community guidelines.

---

## License

MIT — see `LICENSE`.
