/**
 * Per-paper highlight/annotation panel (plan #8 strangler-fig migration).
 *
 * `renderHighlights(paperId, hlData)` is called from the legacy `render()`
 * template; its returned HTML contains inline `onclick=` attributes that
 * call `addHighlight(paperId)` and `removeHighlightById(id)`. All three
 * functions are shimmed onto `window` from main.js until the legacy
 * render path migrates.
 *
 * Persistence is delegated to the legacy `SCQ` IIFE
 * (`SCQ.addHighlight`, `SCQ.removeHighlight`, `SCQ.getHighlights`); a
 * future pass will move these to `services/highlights.js`. After mutating
 * persistence, we trigger the legacy `render()` to repaint the row.
 *
 * NOTE: this is the **UI** highlights module. There is also a non-DOM
 * `services/highlights.js` (CRUD over the highlights table) — different
 * file, different concern. Once render migrates, this module will be the
 * thin glue that calls the service and re-renders.
 */

const DEFAULT_COLOR = '#58a6ff';

function _scq() {
  return globalThis.SCQ;
}

function _rerender() {
  if (typeof globalThis.render === 'function') globalThis.render();
}

export function addHighlight(paperId) {
  const textEl = document.getElementById('hl-text-' + paperId);
  const pageEl = document.getElementById('hl-page-' + paperId);
  const text = (textEl ? textEl.value : '').trim();
  const page = (pageEl ? pageEl.value : '').trim();
  if (!text) return;
  _scq().addHighlight(paperId, text, page || null, DEFAULT_COLOR);
  _rerender();
}

export function removeHighlightById(highlightId) {
  _scq().removeHighlight(highlightId);
  _rerender();
}

export function renderHighlights(paperId, hlData) {
  const hl = hlData || _scq().getHighlights(paperId);
  let html = `<div class="highlights-section">
    <div class="section-label" style="margin-bottom:6px">Highlights &amp; Annotations</div>`;
  if (hl.length > 0) {
    html += hl.map(h => `
      <div class="highlight-item">
        ${h.page ? `<span class="hl-page">p.${h.page}</span>` : ''}
        <span class="hl-text">"${h.text}"</span>
        <button class="hl-delete" onclick="event.stopPropagation(); removeHighlightById(${h.id})" title="Remove">&times;</button>
      </div>`).join('');
  }
  html += `<div class="add-highlight-row">
    <input type="text" id="hl-page-${paperId}" placeholder="p.#" title="Page number">
    <textarea id="hl-text-${paperId}" placeholder="Add highlight or annotation..." rows="1"></textarea>
    <button class="add-highlight-btn" onclick="event.stopPropagation(); addHighlight('${paperId}')">+ Add</button>
  </div></div>`;
  return html;
}
