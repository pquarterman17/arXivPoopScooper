/**
 * Card / tag / notes event handlers (plan #8 strangler-fig migration).
 *
 *   - togglePaper / toggleTag / clearTags: tiny mutators of the legacy
 *     `expandedId` and `selectedTags` slots; each triggers a re-render.
 *   - updateNotes: debounced (500ms) note saver. Mirrors the change to
 *     the in-memory PAPERS row, persists via SCQ.setNote, then nudges
 *     the inline "saved" indicator and "Last edited" timestamp.
 *
 * `noteTimers` lives in module scope — nothing else needs to read it,
 * so the legacy let was dropped from the boot block.
 *
 * All four are reachable from inline onclick / oninput attributes.
 */

const noteTimers = {};

function _scq() { return globalThis.SCQ; }
function _render() {
  if (typeof globalThis.render === 'function') globalThis.render();
}

export function togglePaper(id) {
  globalThis.expandedId = globalThis.expandedId === id ? null : id;
  _render();
}

export function toggleTag(tag) {
  const sel = globalThis.selectedTags;
  if (!sel) return;
  sel.has(tag) ? sel.delete(tag) : sel.add(tag);
  _render();
}

export function clearTags() {
  const sel = globalThis.selectedTags;
  if (sel && typeof sel.clear === 'function') sel.clear();
  _render();
}

export function updateNotes(paperId, value) {
  const SCQ = _scq();
  const PAPERS = globalThis.PAPERS || [];
  const p = PAPERS.find(x => x.id === paperId);
  if (p) p._note = value;
  clearTimeout(noteTimers[paperId]);
  noteTimers[paperId] = setTimeout(() => {
    SCQ.setNote(paperId, value);
    if (p) p._lastEdited = new Date().toISOString();
    const el = document.getElementById('notes-saved-' + paperId);
    if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1200); }
    const tsEl = document.getElementById('note-ts-' + paperId);
    if (tsEl && p) tsEl.textContent = 'Last edited: ' + SCQ.formatRelativeTime(p._lastEdited);
  }, 500);
}
