/**
 * "More" menu in the toolbar. Closes when the user clicks elsewhere or
 * picks an item.
 *
 * Migrated from paper_database.html (plan #8). The legacy setup attached
 * a global click listener at script-eval time; the module does the same
 * at import time. Idempotent — guarded so re-importing or re-bundling
 * doesn't double-attach.
 *
 * `closeMoreMenu` is called from a dozen inline `onclick=` attributes in
 * the toolbar HTML, so it stays exposed as `window.closeMoreMenu` via
 * main.js's shim until those `onclick`s migrate to `addEventListener`.
 */

const MENU_ID = 'more-menu';
const TOGGLE_SELECTOR = '.toolbar-more';

let _outsideClickInstalled = false;

export function closeMoreMenu() {
  const menu = document.getElementById(MENU_ID);
  if (menu) menu.classList.remove('open');
}

/** Attach the document-level "click outside closes the menu" listener once. */
export function installMoreMenuOutsideClick() {
  if (_outsideClickInstalled) return;
  _outsideClickInstalled = true;
  document.addEventListener('click', (e) => {
    const menu = document.getElementById(MENU_ID);
    if (menu && !e.target.closest(TOGGLE_SELECTOR)) {
      menu.classList.remove('open');
    }
  });
}
