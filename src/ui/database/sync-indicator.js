/**
 * Sync indicator. Tiny — updates a single status pill in the header
 * showing whether unsaved changes exist.
 *
 * First migrated feature from paper_database.html (plan item #8).
 * Exposed via main.js as window.updateSyncIndicator for the legacy inline
 * caller in the SCQ.init().then() boot block. Once that boot block moves
 * into a module, the window.* shim can be dropped.
 */

const ELEMENT_ID = 'sync-indicator';

/**
 * Set the indicator state. Idempotent; missing-element-safe.
 *
 * @param {boolean} synced — true = "synced" / green; false = "unsaved changes" / orange
 */
export function updateSyncIndicator(synced) {
  const el = document.getElementById(ELEMENT_ID);
  if (!el) return;
  if (synced) {
    el.textContent = 'synced';
    el.style.color = 'var(--green)';
    el.title = 'All changes saved';
  } else {
    el.textContent = 'unsaved changes';
    el.style.color = 'var(--orange)';
    el.title = "Click 'Save database' to persist your changes";
  }
}
