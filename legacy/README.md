# `legacy/` — historical artifacts only

Files in this directory are **not part of the running app**. They're kept
for reference (e.g., recovering a UI choice that worked) and as part of the
project's history.

> **Do not extend any file in this directory.** New functionality belongs
> in `src/` (frontend) or `scq/` (Python). See
> `plans/architecture-refactor.md` for the active layered architecture.

## Contents

### `archive/` — (empty)

Pre-refactor HTML pages once lived here (`paper_database_old.html`,
`paper_database_v2.html`, `paper_scraper_old.html`, `paper_scraper_v2.html`,
`arxiv_search.html`, `cite_helper.html`, `to_read.html`). All seven were
deleted on 2026-05-02 once `paper_database.html` and `paper_scraper.html`
were confirmed to cover their functionality. Recover any of them from
git history if a UI detail needs to be referenced:

```bash
git show <commit>:legacy/archive/paper_database_v2.html > /tmp/v2.html
```

### `COWORK_MIGRATION_GUIDE.md`

Notes from the project's earlier phase when the workspace was hosted in
Cowork. Mostly historical; some path patterns are still useful when
debugging sandbox vs local-machine issues.
