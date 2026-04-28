# `src/ui/database/` — modular UI for paper_database.html

This directory holds the in-flight decomposition of `paper_database.html`
into per-feature ES modules (plan item **#8**). The legacy page still runs
as the production app; modules are migrated in incrementally.

## Strangler-fig pattern

The legacy `paper_database.html` has ~4700 lines of inline `<script>`. We
don't rewrite it in one go. Instead:

1. `main.js` is the new module entry, loaded via
   `<script type="module" src="src/ui/database/main.js">` *after* the
   legacy script tags. By the time `main.js` runs, all legacy globals
   (`SCQ`, `PAPERS`, `FIGS`, `SCRAPER_CONFIG`, etc.) are set up.

2. Each migrated feature lives in `src/ui/database/<feature>.js`. It
   imports from `../../core/`, `../../services/`, and other features
   under this dir. The legacy code path expects the function to be
   reachable as `window.<name>`, so `main.js` shims each export onto
   `window`. Once the last legacy caller of a function is gone, drop
   the shim.

3. Inline `onclick="foo()"` attributes in the HTML still work *because of
   the window shim*. As features migrate, replace those with
   `addEventListener` from inside the module. The HTML's `onclick=`
   attributes get cleaned up section-by-section as we go.

4. CSS extraction is a separate pass (the inline `<style>` is 1200+
   lines). Don't try to extract per-feature CSS at the same time as the
   JS; do CSS as one big atomic move into `src/styles/database.css`.

## Migration backlog

Per the plan, in roughly increasing complexity:

| Section in legacy HTML        | Lines       | Status            |
|-------------------------------|-------------|-------------------|
| Sync indicator                | 1943–1957   | ✅ migrated       |
| PDF Viewer Panel              | 3100–3119   | open (small)      |
| Annotation Highlights         | 3120–3154   | open (small)      |
| Sort                          | 2810–2843   | open (small)      |
| Word citation copy            | 2844–2855   | open (small)      |
| Helpers                       | 2348–2416   | open              |
| PDF path helper               | 2165–2169   | open (tiny)       |
| Collection .bib export        | 2170–2182   | open              |
| Collection .json export       | 2183–2242   | open              |
| Manual paper linking          | 2243–2320   | open              |
| Related papers detection     | 2321–2347   | open              |
| Init                          | 1892–1942   | open (load order) |
| Sync indicator                | 1943–1957   | ✅                |
| Export/Import                 | 1958–2164   | open              |
| Collections                   | 2417–2483   | open              |
| Add Website / Link modal     | 2484–2809   | open (medium)     |
| Render                        | 2856–3058   | open (medium)     |
| Event handlers                | 3059–3099   | open              |
| Drag-and-drop PDF import     | 1672–1891   | open (medium)     |
| Analytics Dashboard           | 1458–1651   | open (medium)     |
| More menu                     | 1448–1457   | open (tiny)       |
| Tag management                | 3155–3888   | open (large)      |
| Collaboration                 | 3889–4649   | open (largest)    |

(Line numbers were valid as of plan creation; they drift as features
migrate. Use grep for current locations.)

## Migration recipe

For each feature:

1. **Read** the legacy block. Trace every reference to globals (`SCQ`,
   `PAPERS`, `_jp`, etc.) and DOM elements.
2. **Carve** a module file with named exports for the public functions.
3. **Replace** legacy global references with proper imports where the
   target has already been migrated (e.g., paper CRUD goes through
   `services/papers.js`, not the legacy `SCQ.getAllPapers()`).
4. **Shim** `window.<name>` from `main.js` for any function still
   called from inline `onclick=` or unmigrated legacy code.
5. **Delete** the inline definition in `paper_database.html`.
6. **Smoke-test** the page: open `paper_database.html` in a browser
   served by `serve.py` (file:// won't work for ES modules), exercise
   the migrated feature, watch the console for errors.
7. **Commit** with `feat(ui/database): migrate <feature>`.

## What goes in main.js

Right now: just import + window-shim. Eventually:
- Replace the legacy `SCQ.init().then(...)` block in the HTML with a
  `boot()` function exported from main.js
- Wire all event listeners declaratively from a single `init()` call
- Drop `window.*` shims once their last caller is gone
