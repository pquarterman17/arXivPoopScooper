# `legacy/` — historical artifacts only

Files in this directory are **not part of the running app**. They're kept
for reference (e.g., recovering a UI choice that worked) and as part of the
project's history.

> **Do not extend any file in this directory.** New functionality belongs
> in `src/` (frontend) or `scq/` (Python). See
> `plans/architecture-refactor.md` for the active layered architecture.

## Contents

### `archive/` — superseded HTML pages

Pre-refactor versions of the database and scraper UIs, plus separate
single-page tools that have been folded into the main app:

| File                          | Replaced by                                  |
|-------------------------------|----------------------------------------------|
| `paper_database_old.html`     | `paper_database.html` (and eventually `src/ui/database/`) |
| `paper_database_v2.html`      | `paper_database.html`                        |
| `paper_scraper_old.html`      | `paper_scraper.html` (and eventually `src/ui/scraper/`)   |
| `paper_scraper_v2.html`       | `paper_scraper.html`                         |
| `arxiv_search.html`           | `paper_scraper.html` Search tab              |
| `cite_helper.html`            | `paper_database.html` Cite tab               |
| `to_read.html`                | `paper_database.html` Reading List tab       |

These should be deleted once the corresponding successor file has been
verified to cover all the functionality. Until then they stay around as a
reference for "how did the old version handle X?".

### `COWORK_MIGRATION_GUIDE.md`

Notes from the project's earlier phase when the workspace was hosted in
Cowork. Mostly historical; some path patterns are still useful when
debugging sandbox vs local-machine issues.

## When to delete the archive

When `paper_database.html` and `paper_scraper.html` themselves are
decomposed into `src/ui/` modules (plan items #8 and #9), the legacy HTML
pages will also become superseded. At that point most of `archive/` can
be deleted entirely. Leave a small index here so the git history is
discoverable, but the bulk should go.
