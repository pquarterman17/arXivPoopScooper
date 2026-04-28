/**
 * Exports service. Convert collections / search results into BibTeX,
 * plain-text, or JSON.
 *
 * Pure formatting: takes paper arrays in, returns strings out. The "trigger
 * a download" step is a UI concern — that lives in src/ui/ and calls these
 * functions to produce the bytes.
 *
 * No DOM. Safe to import in node.
 */

import { listPapers as _listCollectionPapers, listForPaper as _collectionsForPaper } from './collections.js';
import { listAll as _listAllPapers, getById as _getPaper } from './papers.js';
import { listForPaper as _highlightsForPaper } from './highlights.js';
import { listForPaper as _linksForPaper } from './links.js';
import { get as _getNote } from './notes.js';
import { get as _getReadStatus } from './read-status.js';
import { formatBibTeX, formatPlainText } from './citations.js';

/** A collection's papers as a single BibTeX string (newline-separated). */
export function collectionToBibTeX(name, opts = {}) {
  return _listCollectionPapers(name)
    .map((p) => formatBibTeX(_normalize(p), opts.citations))
    .join('\n\n');
}

/** A collection's papers as a plain-text reference list, one per line. */
export function collectionToPlainText(name, opts = {}) {
  return _listCollectionPapers(name)
    .map((p, i) => `[${i + 1}] ${formatPlainText(_normalize(p), opts.citations)}`)
    .join('\n');
}

/**
 * A collection as a JSON object. Mirrors the legacy `exportJSON` shape,
 * scoped to one collection: { exportedAt, name, papers: [...] }.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.includeNotes]      default false (privacy)
 * @param {boolean} [opts.includeHighlights] default true
 */
export function collectionToJson(name, opts = {}) {
  const includeNotes = opts.includeNotes ?? false;
  const includeHighlights = opts.includeHighlights ?? true;
  const papers = _listCollectionPapers(name);
  return {
    name,
    exportedAt: new Date().toISOString(),
    papers: papers.map((p) => _toJsonRecord(p, { includeNotes, includeHighlights })),
  };
}

/**
 * Whole-database JSON export (paper metadata + per-paper user state).
 * Honors the same privacy flags as collectionToJson.
 */
export function databaseToJson(opts = {}) {
  const includeNotes = opts.includeNotes ?? false;
  const includeHighlights = opts.includeHighlights ?? true;
  const papers = _listAllPapers();
  return {
    exportedAt: new Date().toISOString(),
    papers: papers.map((p) => _toJsonRecord(p, { includeNotes, includeHighlights })),
  };
}

// ─── internals ───

function _normalize(p) {
  // listAll() / listPapers() return the joined view but tags may still be
  // serialized JSON when coming through certain code paths. Belt-and-braces.
  if (typeof p.tags === 'string') {
    try { p = { ...p, tags: JSON.parse(p.tags) }; } catch { p = { ...p, tags: [] }; }
  }
  return p;
}

function _toJsonRecord(p, { includeNotes, includeHighlights }) {
  const norm = _normalize(p);
  const id = p.id;
  const rec = {
    id,
    title: norm.title,
    authors: norm.authors,
    short_authors: norm.short_authors,
    year: norm.year,
    journal: norm.journal,
    doi: norm.doi,
    arxiv_id: norm.arxiv_id,
    url: norm.url,
    summary: norm.summary,
    tags: Array.isArray(norm.tags) ? norm.tags : [],
    entry_type: norm.entry_type,
    date_added: norm.date_added,
    collections: _collectionsForPaper(id),
    links: _linksForPaper(id).map((l) => l.id),
  };
  const rs = _getReadStatus(id);
  rec.is_read = !!(rs?.is_read);
  rec.priority = rs?.priority ?? 0;
  if (includeNotes) {
    const note = _getNote(id);
    rec.note = note ? note.content : '';
    rec.note_last_edited = note ? note.last_edited : '';
  }
  if (includeHighlights) {
    rec.highlights = _highlightsForPaper(id).map((h) => ({
      text: h.text, page: h.page, color: h.color,
    }));
  }
  return rec;
}
