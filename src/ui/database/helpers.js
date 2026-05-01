/**
 * Shared filter / search helpers + lightbox + clipboard copy
 * (plan #8 strangler-fig migration).
 *
 *   - getAllTags / getFiltered: read-only over PAPERS + the legacy filter
 *     `var`s (searchQuery, selectedTags, readFilter, priorityFilter,
 *     typeFilter, activeCollection, pdfSearchEnabled). The legacy render()
 *     is the primary caller.
 *   - togglePdfSearch: toggles the PDF full-text-search mode and re-renders.
 *   - copyText: copies to clipboard and gives the trigger button a
 *     "Copied!" pulse via the legacy `copiedTimers` map.
 *   - openLightbox / closeLightbox: image lightbox over the figures grid.
 */

function _g(name, fallback) {
  const v = globalThis[name];
  return v === undefined ? fallback : v;
}
function _scq() { return globalThis.SCQ; }
function _render() {
  if (typeof globalThis.render === 'function') globalThis.render();
}

export function getAllTags() {
  const PAPERS = globalThis.PAPERS || [];
  const s = new Set();
  PAPERS.forEach(p => p.tags.forEach(t => s.add(t)));
  return [...s].sort();
}

export function getFiltered() {
  const PAPERS = globalThis.PAPERS || [];
  const SCQ = _scq();
  const q = _g('searchQuery', '').toLowerCase();
  const selectedTags = _g('selectedTags', new Set());
  const readFilter = _g('readFilter', 'all');
  const priorityFilter = _g('priorityFilter', 'any');
  const typeFilter = _g('typeFilter', 'all');
  const activeCollection = _g('activeCollection', null);
  const pdfSearchEnabled = _g('pdfSearchEnabled', false);
  const pdfSearchHits = _g('pdfSearchHits', {});

  return PAPERS.filter(p => {
    let matchSearch = !q ||
      p.title.toLowerCase().includes(q) ||
      p.authors.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) ||
      p.summary.toLowerCase().includes(q) ||
      p.group.toLowerCase().includes(q) ||
      p.id.includes(q) ||
      (p._note || '').toLowerCase().includes(q) ||
      (p.keyResults || []).some(r => r.toLowerCase().includes(q));
    if (!matchSearch && pdfSearchEnabled && q) {
      const hits = SCQ.searchPdfText(q);
      if (hits[p.id]) {
        matchSearch = true;
        pdfSearchHits[p.id] = hits[p.id];
      }
    }
    const matchTags = selectedTags.size === 0 || [...selectedTags].every(t => p.tags.includes(t));
    const matchRead = readFilter === 'all' ||
      (readFilter === 'read' && p._read) ||
      (readFilter === 'unread' && !p._read);
    const matchPriority = priorityFilter === 'any' ||
      (priorityFilter === 'starred' && p._priority >= 1) ||
      (priorityFilter === 'high' && p._priority === 3);
    const matchType = typeFilter === 'all' || (p.entryType || 'preprint') === typeFilter;
    const matchCollection = !activeCollection || SCQ.getCollectionsForPaper(p.id).includes(activeCollection);
    return matchSearch && matchTags && matchRead && matchPriority && matchType && matchCollection;
  });
}

export function togglePdfSearch(enabled) {
  globalThis.pdfSearchEnabled = enabled;
  if (enabled && !_scq().hasPdfIndex()) {
    alert('No PDF text indexed yet. Run: python tools/init_database.py --migrate\nwith PDFs in the pdfs/ folder to index them.');
    document.getElementById('pdf-search-toggle').checked = false;
    globalThis.pdfSearchEnabled = false;
    return;
  }
  globalThis.pdfSearchHits = {};
  _render();
}

export function copyText(text, btnId) {
  navigator.clipboard.writeText(text);
  const btn = document.getElementById(btnId);
  const timers = _g('copiedTimers', {});
  if (btn) {
    btn.classList.add('copied');
    btn.dataset.origText = btn.textContent;
    btn.textContent = 'Copied!';
  }
  clearTimeout(timers[btnId]);
  timers[btnId] = setTimeout(() => {
    if (btn) {
      btn.classList.remove('copied');
      btn.textContent = btn.dataset.origText;
    }
  }, 1500);
}

export function openLightbox(figKey, caption) {
  const FIGS = globalThis.FIGS || {};
  document.getElementById('lb-img').src = FIGS[figKey];
  document.getElementById('lb-caption').textContent = caption;
  document.getElementById('lightbox').style.display = 'flex';
}

export function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}
