/**
 * Side-panel PDF viewer (plan #8 strangler-fig migration).
 *
 * The "open in panel" button on each library row uses inline `onclick=`,
 * and the global Escape-key handler closes this panel — both reach in via
 * `window.openPdfViewer` / `window.closePdfViewer`, so main.js shims them.
 *
 * `currentPdfSrc` was a top-level `let` in the legacy file referenced by
 * exactly these three functions and nothing else, so it moves into the
 * module as private state.
 *
 * Known pre-existing bug (NOT addressed here — port is 1:1): the panel
 * HTML at the bottom of paper_database.html uses ids `pdf-title` /
 * `pdf-iframe` and an inline `onclick="closePdfPanel()"`, while this code
 * targets `pdf-viewer-title` / `pdf-viewer-iframe` / `closePdfViewer`.
 * Either the JS or the HTML needs to be fixed in a separate commit.
 */

import { getPdfPath } from './pdf-path.js';

let _currentPdfSrc = '';

export function openPdfViewer(paperId) {
  const papers = globalThis.PAPERS || [];
  const paper = papers.find(p => p.id === paperId);
  const src = getPdfPath(paperId);
  _currentPdfSrc = src;
  const titleEl = document.getElementById('pdf-viewer-title');
  if (titleEl) {
    titleEl.textContent = paper ? paper.shortAuthors + ' — ' + paper.title.substring(0, 60) : paperId;
  }
  const iframe = document.getElementById('pdf-viewer-iframe');
  if (iframe) iframe.src = src;
  const panel = document.getElementById('pdf-viewer-panel');
  if (panel) panel.classList.remove('hidden');
  document.body.classList.add('pdf-panel-open');
}

export function closePdfViewer() {
  const panel = document.getElementById('pdf-viewer-panel');
  if (panel) panel.classList.add('hidden');
  document.body.classList.remove('pdf-panel-open');
  const iframe = document.getElementById('pdf-viewer-iframe');
  if (iframe) iframe.src = '';
  _currentPdfSrc = '';
}

export function openPdfExternal() {
  if (_currentPdfSrc) window.open(_currentPdfSrc, '_blank');
}
