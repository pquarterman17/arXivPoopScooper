/**
 * Cross-module state manifest for the scraper UI.
 *
 * **Not a state-management abstraction.** This module exists to:
 *   1. Document which globalThis bindings are load-bearing for the
 *      module-to-boot-block bridge during plan #9's strangler-fig
 *      migration.
 *   2. Provide an `initState()` helper that the boot block calls during
 *      init() to ensure every binding is a fresh, well-typed value
 *      before any tab module reads it.
 *
 * The actual storage lives on `globalThis` because paper_scraper.html's
 * boot block declares each name with `var` (which sets globalThis.<name>
 * to the same slot). Module code reads/writes via globalThis. Once the
 * boot block is fully retired (post-#9 final wave), this module should
 * become the canonical owner — boot-block `var` declarations get
 * deleted and `state` becomes a real Map / typed object.
 *
 * Names + their owners:
 *   searchResults     — search-tab.js (current results from doSearch)
 *   selectedIdxs      — search-tab.js (Set of selected result indices)
 *   inbox             — inbox-render.js + inbox-persistence.js
 *   savedQueries      — saved-queries.js (persisted searches)
 *   existingIds       — set during init from the SQLite DB; read by
 *                       search-tab.js to grey out duplicates
 *   quickResults      — quick-search.js
 *   quickSelected     — quick-search.js
 *   activeSources     — search-tab.js (per-source enabled flag)
 *   dbReady           — set by init; read by tabs.js + inbox actions
 *   lastFetchTime     — set by search-tab.js; read by tabs.js
 */

const NAMES = [
  'searchResults', 'selectedIdxs', 'inbox', 'savedQueries', 'existingIds',
  'quickResults', 'quickSelected', 'activeSources',
  'dbReady', 'lastFetchTime',
];

/**
 * Return the names this module documents — a tiny helper so tests +
 * tooling can assert no binding goes undeclared.
 */
export function stateNames() {
  return NAMES.slice();
}

/**
 * Force-initialize all manifest bindings to safe defaults if they're
 * currently undefined. Call from boot-block init() before any tab
 * module reads the values. Idempotent.
 */
export function initState() {
  if (globalThis.searchResults === undefined) globalThis.searchResults = [];
  if (globalThis.selectedIdxs === undefined) globalThis.selectedIdxs = new Set();
  if (globalThis.inbox === undefined) globalThis.inbox = [];
  if (globalThis.savedQueries === undefined) globalThis.savedQueries = [];
  if (globalThis.existingIds === undefined) globalThis.existingIds = new Set();
  if (globalThis.quickResults === undefined) globalThis.quickResults = [];
  if (globalThis.quickSelected === undefined) globalThis.quickSelected = new Set();
  if (globalThis.activeSources === undefined) globalThis.activeSources = {};
  if (globalThis.dbReady === undefined) globalThis.dbReady = false;
  if (globalThis.lastFetchTime === undefined) globalThis.lastFetchTime = null;
}

globalThis.initState = initState;
