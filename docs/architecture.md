# Layered Architecture

The repo went through a strangler-fig migration from two monolithic HTML files (~4700 + ~1600 lines of inline JS) into a layered structure with clear separation between framework-agnostic logic and DOM-coupled UI. This doc explains the layers and the three load-bearing rules that keep them coherent.

## The four layers, top-down

```
┌────────────────────────────────────────────────────────────────┐
│ HTML pages           paper_database.html, paper_scraper.html   │
│                      Markup + boot block (kept thin)           │
├────────────────────────────────────────────────────────────────┤
│ src/ui/<page>/       DOM-coupled per-page modules              │
│                      Vue-port target — replace this layer first│
├────────────────────────────────────────────────────────────────┤
│ src/services/        Pure logic. NO DOM. Survives Vue port.    │
│                      arxiv, papers, citations, settings, etc.  │
├────────────────────────────────────────────────────────────────┤
│ src/core/            Framework primitives. NO DOM.             │
│                      db (sql.js), store (observable), events,  │
│                      config (loader cache + subscribers)       │
└────────────────────────────────────────────────────────────────┘
```

Plus, on the Python side, `scq/` mirrors the layout: `scq/config/`, `scq/db/`, `scq/arxiv/`, `scq/ingest/`, `scq/server.py`. Both halves read the same `data/user_config/*.json` files — the configuration system is the seam.

## The three rules

These are the only rules that matter; everything else is convention.

### 1. `core/` and `services/` must never touch the DOM

No `document.*`, no `window.*` (except the legacy globalThis shim where unavoidable — and even those are clearly named `_<feature>` to flag them as a temporary contract). No `getElementById`, no `addEventListener`. Take state, return data.

The reason: these layers must run unchanged in node/jsdom for testing, and they must survive a Vue 3 port unchanged. Touching the DOM in a service means you'd have to rewrite the service when the UI shape changes, which defeats the whole point of separating the layers.

Verifying: `npx vitest run` runs every service spec under jsdom. If a service starts to need DOM access, the test fails before the merge.

### 2. `ui/` modules import services, never the other way around

The dependency arrow points *into* the framework-agnostic layer. `src/ui/database/library-table.js` imports `src/services/papers.js`; the reverse never happens.

If you find yourself wanting to call a UI render from a service, that's a sign the service is doing too much. The right pattern is: the service emits an event (via `core/events.js` or the store), the UI module subscribes, and the UI module decides how to redraw.

### 3. State changes flow through `core/store.js`, not via direct mutation

The store API mirrors Pinia's shape (`store.state`, `store.subscribe`, actions). When a Vue port happens, swapping the store implementation is mechanical — service code doesn't change.

In practice the legacy boot blocks still mutate global state via `globalThis.<name> = ...` and `var <name>` declarations. Each new module-extracted feature should *not* add to that pile; use the store.

## What's *not* a layer

- **`scraper_config.js`** is shipping defaults plus a few legacy fields the JS apps still read directly (`entryTypes`, `tags` for the auto-tagger). It's not a layer — it's a static input that the loader merges with user_config. Don't add new logic to it.
- **`db_utils.js`** is the legacy IIFE that wraps sql.js. New code should import from `src/core/db.js` instead. The IIFE stays around because the boot blocks and `services/database-merge.js` still rely on it.

## TypeScript checking via JSDoc

The repo has no build step but runs `tsc --noEmit` over a curated set of files in CI. Files opt in by putting `// @ts-check` on the first line; their JSDoc `@param` / `@returns` annotations get full TypeScript-grade checking.

Currently checked: `src/core/**/*.js` and `src/dev/**/*.js`. Add `// @ts-check` to a file and update the `include` glob in `tsconfig.json` to extend coverage. JSDoc convention: ASCII hyphen (`-`) before descriptions, never em-dash (`—`) — TS's parser rejects em-dashes after parameter names with a TS1127.

Local: `npm run typecheck`. CI: runs as a step in the `vitest (frontend)` job.

## Testing topology

- **vitest** under jsdom drives `src/core/`, `src/services/`, and (where they're testable) `src/ui/`. Tests live in `src/tests/` mirroring the source layout.
- **pytest** drives `scq/`. Tests live in `tests/` at the repo root.
- **shared vectors** in `tests/vectors/` are JSON fixtures that both vitest and pytest consume — see `tests/vectors/README.md`. Adding a vector adds a parametrized case to both suites automatically; this catches JS/Python parity bugs.
- **e2e smoke** (`.github/workflows/test.yml` → `e2e-smoke` job) spins up `scq serve` and hits a representative slice of endpoints. Catches regressions the unit tests can't see (proxy, no-cache headers, chdir-to-repo-root).

## Dev harness

`dev.html` at the repo root is a Storybook-style harness for iterating on UI modules against fixture state. Visit `http://localhost:8080/dev.html` after `python -m scq serve`. Stories live in `src/dev/stories/*.js`; each is `{id, title, description, render(stage, setState)}`. The active story is in `location.hash` so reloading keeps you put.

Currently focused on the `schema-form` renderer (the most-shapeful UI we have). Add stories for any UI module that's awkward to test inline in the full page.

## The page bridge

The boot block in each HTML page calls extracted module functions as bare globals (e.g. `togglePaper(id)` from inside an inline `onclick` template string). The two pages handle this seam differently but the contract is the same.

**Database page** (`src/ui/database/main.js`): one centralized `BRIDGE = {...}` object lists every public function the boot block needs to reach, then `Object.assign(window, BRIDGE)` publishes them. The bridge also exposes `window.__SCQ_DATABASE_BRIDGE__` so a debugger can introspect the surface at runtime.

**Scraper page** (`src/ui/scraper/<module>.js`): each module appends `globalThis.<name> = <name>` at its bottom, exporting its own surface. The page's bridge is the union across all modules.

Two frozen-list specs lock the contracts:

- `src/tests/ui/database/bridge.test.js` — parses the `BRIDGE = {...}` block in main.js and asserts the keys match the checked-in `EXPECTED_BRIDGE_KEYS`.
- `src/tests/ui/scraper/bridge.test.js` — walks every scraper module, collects every `globalThis.<name> =` assignment, and asserts the union matches `EXPECTED_SCRAPER_BRIDGE`.

When you add a new bridge entry, update the corresponding `EXPECTED_*` list in the same commit. The spec gives a clear "Added without updating list / Removed but still in list" diff; that's the forced choice.

When you remove one, the spec still passes only after you also remove it from the list — that's also the forced choice. This is the **only** mechanism that catches "added a function but forgot to bridge it" or "renamed a function but missed a boot-block call site" — there's no other tooling that can observe the seam.

## Where the boundary cracks show

A few load-bearing seams are documented separately:

- **The page bridge** described above — the legacy boot blocks reach extracted module functions via `window.<name>?.()`. The bridge tests are the contract.
- **`SCRAPER_CONFIG` ↔ `getConfig('search-sources')`** is bridged by `src/core/search-config-bridge.js`. Array→map adapter at the boundary so the legacy id-keyed map callers keep working while user_config overrides flow through the loader.
- **`scq.config.paths` submodule shadow** — see [the dedicated note](configuration.md#scq.config.paths-submodule-shadow).
