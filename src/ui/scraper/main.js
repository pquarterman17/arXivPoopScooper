/**
 * Entry point for the modular paper-scraper UI (plan #9 — companion to #8).
 *
 * **Strangler-fig migration in progress.** The legacy `paper_scraper.html`
 * is ~1600 lines of inline JS + 18 inline `onclick=` attributes (down from
 * 39) after the static-handler sweep. As features peel out of the inline
 * `<script>` block into modules under `src/ui/scraper/`, this file imports
 * them, re-exposes their public API on `window` so the still-inline boot
 * block keeps working, and dispatches `data-action` / `data-change` events
 * on the static markup through delegated listeners.
 *
 * **Loading order:** this script tag is `type="module"`, deferred until
 * after the document is parsed *and* after legacy `<script>` tags run.
 *   1. CDN scripts (sql.js) — synchronous
 *   2. `scraper_config.js`, `db_utils.js` — synchronous, sets globals
 *   3. The big inline `<script>` block — synchronous, defines all the
 *      legacy functions on the global scope
 *   4. THIS module — installs the delegated listeners + ACTION registry
 *   5. `init()` from the inline block fires last (it lives at the bottom)
 *
 * Convention: each ACTIONS entry is a thin trampoline to the legacy global
 * function (`window.foo?.()`). Optional chaining means if a function isn't
 * yet defined when the user clicks, no crash. As modules migrate, replace
 * the trampoline with a direct import.
 */

// Each handler receives `(el, event)` where `el` is the closest element
// carrying the data-action attr (NOT necessarily event.target, which can be
// a child).
const ACTIONS = {
  // ─ Tabs (legacy `switchTab` is generic; data-tab carries the target id)
  switchScraperTab: (el) => window.switchTab?.(el.dataset.tab),

  // ─ Search tab
  doSearch: () => window.doSearch?.(),
  saveCurrentSearch: () => window.saveCurrentSearch?.(),
  clearDateFilter: () => window.clearDateFilter?.(),
  stageSelected: () => window.stageSelected?.(),
  clearSelection: () => window.clearSelection?.(),

  // ─ Quick Search tab
  quickDoSearch: () => window.quickDoSearch?.(),
  quickSelectAll: () => window.quickSelectAll?.(),
  quickSelectNone: () => window.quickSelectNone?.(),
  quickExportSelected: () => window.quickExportSelected?.(),

  // ─ DOI Lookup tab
  doDoiLookup: () => window.doDoiLookup?.(),

  // ─ Inbox tab
  approveAll: () => window.approveAll?.(),
  clearInbox: () => window.clearInbox?.(),

  // ─ Saved queries panel
  openAddQueryModal: () => window.openAddQueryModal?.(),
  runAllSavedQueries: () => window.runAllSavedQueries?.(),
  closeScraperModal: () => window.closeModal?.(),
  confirmSaveQuery: () => window.confirmSaveQuery?.(),

  // ─ Connection test (in the header status badge)
  runConnectionTest: (_el, e) => {
    e.preventDefault();
    window.runConnectionTest?.();
  },

  // ─ Keyboard: Enter inside the DOI input box triggers lookup
  // (registered via the keydown delegate below, not the click delegate)
  doDoiLookupOnEnter: undefined,
};

const CHANGES = {};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) fn(el, e);
});

// Keydown delegate. Currently only the DOI input cares about Enter, but the
// pattern scales: action name `<thing>OnEnter` → call window.<thing>().
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const el = e.target.closest('[data-action$="OnEnter"]');
  if (!el) return;
  const action = el.dataset.action;
  // Strip the "OnEnter" suffix to get the real action name
  const fnName = action.slice(0, -'OnEnter'.length);
  const fn = window[fnName];
  if (typeof fn === 'function') fn();
});
