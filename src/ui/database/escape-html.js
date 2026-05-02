/**
 * Single source of truth for HTML escaping in the database UI.
 *
 * Extracted from paper_database.html boot block (line 433 pre-refactor)
 * as part of plan #8 boot-block polish. The browser's textContent->
 * innerHTML round-trip is the canonical "safe in HTML attribute or text
 * node" escape: it converts <, >, &, ", ' into the right entities for
 * those contexts.
 *
 * Pre-refactor this lived in three places:
 *   1. paper_database.html top-level (used by every template-string in
 *      the boot block).
 *   2. src/ui/database/drag-drop-import.js (private duplicate).
 *   3. Implicit in many other render functions that did manual replace
 *      chains.
 *
 * This module replaces (1). The drag-drop-import.js duplicate gets
 * removed in this same commit. Future renderers should import from
 * here rather than re-implementing.
 *
 * Note: this is HTML-content escape, NOT URL-attribute escape. For
 * `href="..."` values use encodeURIComponent on the relevant segment
 * separately.
 */

export function escapeHtml(text) {
  if (text == null || text === '') return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// Window shim — the boot block has dozens of template literals that
// reference `escapeHtml(...)` by bare name (resolves through globalThis).
globalThis.escapeHtml = escapeHtml;
