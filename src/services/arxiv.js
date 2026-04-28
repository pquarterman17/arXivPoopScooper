/**
 * arXiv service — pure logic, no DOM, no globals.
 *
 * Replaces the duplicated `searchArxiv` / `searchPhysRev` helpers in
 * paper_scraper.html. The two differ only by an optional `jr:<journal_ref>`
 * filter, so they collapse to a single function.
 *
 * Environment plumbing — fetch impl, XML parser, URL rewriting — is taken via
 * opts so node tests can run without a browser. The two HTML pages will pass
 * their existing `corsFetch` and `DOMParser`.
 *
 * Usage:
 *   import { searchArxiv, normalizeArxivId } from '../services/arxiv.js';
 *   const papers = await searchArxiv('transmon coherence', {
 *     fetch: corsFetch,
 *     parseXml: (xml) => new DOMParser().parseFromString(xml, 'application/xml'),
 *     maxResults: 25,
 *   });
 */

const ARXIV_BASE = 'https://arxiv.org/api/query';

/**
 * Normalize a user-provided arXiv reference into a bare ID.
 * Accepts:
 *   "2401.12345"            → "2401.12345"
 *   "2401.12345v2"          → "2401.12345"
 *   "arXiv:2401.12345"      → "2401.12345"
 *   "https://arxiv.org/abs/2401.12345" → "2401.12345"
 *   "https://arxiv.org/pdf/2401.12345v3.pdf" → "2401.12345"
 *   "cond-mat/0301001" (old-style) → "cond-mat/0301001"
 *   "cond-mat/0301001v1"           → "cond-mat/0301001"
 * Returns null if no recognizable ID is present.
 */
export function normalizeArxivId(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // New-style: 1234.56789 (5-digit suffix in 2014+, 4-digit before)
  const newStyle = trimmed.match(/(\d{4}\.\d{4,5})(?:v\d+)?/);
  if (newStyle) return newStyle[1];
  // Old-style: archive/YYMMNNN
  const oldStyle = trimmed.match(/([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/);
  if (oldStyle) return oldStyle[1];
  return null;
}

/**
 * Build the URL for an arXiv API call. Pure function — no fetch.
 *
 * @param {object} opts
 * @param {string} [opts.query]       — free-text search (mutually optional with idList)
 * @param {string[]} [opts.idList]    — ID lookup (preferred over query for known IDs)
 * @param {string} [opts.journalRef]  — restrict to a journal_ref filter (PRL, PRA, etc.)
 * @param {string} [opts.sort]        — relevance | updated | date-asc | date-desc
 * @param {number} [opts.maxResults]  — default 25
 * @param {number} [opts.start]       — pagination offset, default 0
 * @returns {string} the full URL
 */
export function buildSearchUrl(opts = {}) {
  const sort = sortParams(opts.sort ?? 'date-desc');
  const max = Math.max(1, Math.min(100, opts.maxResults ?? 25));
  const start = Math.max(0, opts.start ?? 0);
  if (Array.isArray(opts.idList) && opts.idList.length > 0) {
    const ids = opts.idList.map(normalizeArxivId).filter(Boolean).join(',');
    return `${ARXIV_BASE}?id_list=${encodeURIComponent(ids)}&start=${start}&max_results=${max}&${sort}`;
  }
  if (typeof opts.query !== 'string' || opts.query.trim().length === 0) {
    throw new Error('[services/arxiv] buildSearchUrl requires `query` or non-empty `idList`');
  }
  let q = `all:${encodeURIComponent(opts.query)}`;
  if (opts.journalRef) q += `+AND+jr:${opts.journalRef}`;
  return `${ARXIV_BASE}?search_query=${q}&start=${start}&max_results=${max}&${sort}`;
}

/**
 * Translate the UI's sort dropdown value to arXiv API params.
 */
export function sortParams(value) {
  switch (value) {
    case 'relevance': return 'sortBy=relevance&sortOrder=descending';
    case 'updated':   return 'sortBy=lastUpdatedDate&sortOrder=descending';
    case 'date-asc':  return 'sortBy=submittedDate&sortOrder=ascending';
    case 'date-desc':
    default:          return 'sortBy=submittedDate&sortOrder=descending';
  }
}

/**
 * Parse arXiv's Atom XML response into plain paper objects.
 *
 * @param {string} xml         — response body
 * @param {object} [opts]
 * @param {function} [opts.parseXml] — XML parser; default uses globalThis.DOMParser
 * @param {string} [opts.source]     — what to put in paper.source (default 'arxiv')
 * @returns {Array<object>}
 */
export function parseAtom(xml, opts = {}) {
  const parseXml = opts.parseXml ?? _defaultParseXml;
  const source = opts.source ?? 'arxiv';
  if (!parseXml) throw new Error('[services/arxiv] no XML parser available; pass opts.parseXml');
  const doc = parseXml(xml);
  const entries = Array.from(doc.querySelectorAll('entry'));
  return entries.map((e) => _entryToPaper(e, source));
}

/**
 * Search arXiv. Composes URL build + fetch + parse.
 *
 * @param {string} query — free-text query, or pass opts.idList instead
 * @param {object} [opts]
 * @param {function} opts.fetch    — fetch impl (required; HTML pages pass corsFetch)
 * @param {function} opts.parseXml — XML parser (required in non-browser env)
 * @param {string|null} [opts.journalRef]  — see buildSearchUrl
 * @param {string} [opts.sort]
 * @param {number} [opts.maxResults]
 * @param {string[]} [opts.idList]
 * @param {string} [opts.sourceLabel] — what to put in paper.source (e.g. 'prl')
 * @returns {Promise<Array<object>>}
 */
export async function searchArxiv(query, opts = {}) {
  const url = buildSearchUrl({ ...opts, query });
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) throw new Error('[services/arxiv] no fetch available');
  const resp = await fetchFn(url);
  if (!resp.ok) {
    if (resp.status === 429) throw new Error('arXiv rate-limited (HTTP 429) — wait a moment and retry');
    throw new Error(`arXiv returned HTTP ${resp.status}`);
  }
  const xml = await resp.text();
  return parseAtom(xml, { parseXml: opts.parseXml, source: opts.sourceLabel ?? 'arxiv' });
}

/**
 * Sort papers in-memory. Used after fetch; covers modes the API can't do
 * (e.g. by first author surname).
 */
export function sortPapers(papers, sortValue) {
  const list = [...papers];
  switch (sortValue) {
    case 'relevance':
      return list; // arXiv already sorted; no-op
    case 'date-asc':
      return list.sort((a, b) => (a.published || '').localeCompare(b.published || ''));
    case 'date-desc':
    case 'updated':
      return list.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
    case 'author':
      return list.sort((a, b) => (a.shortAuthors || '').localeCompare(b.shortAuthors || ''));
    case 'title':
      return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    default:
      return list;
  }
}

// ─── internals ───

function _defaultParseXml(xml) {
  if (typeof globalThis.DOMParser !== 'function') return null;
  return new globalThis.DOMParser().parseFromString(xml, 'application/xml');
}

function _entryToPaper(entry, source) {
  const idUrl = _text(entry, 'id') || '';
  const arxivId = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '');
  const title = _collapseWhitespace(_text(entry, 'title'));
  const summary = _collapseWhitespace(_text(entry, 'summary'));
  const published = _text(entry, 'published') || '';
  const year = published ? new Date(published).getFullYear() : '';
  const authors = Array.from(entry.querySelectorAll('author name')).map((n) => n.textContent || '');
  const categories = Array.from(entry.querySelectorAll('category')).map((c) => c.getAttribute('term') || '');
  const doi = _text(entry, 'doi') || '';
  const journalRef = _text(entry, 'journal_ref') || '';

  const shortAuthors = authors.length > 3
    ? `${_lastName(authors[0])} et al.`
    : authors.map(_lastName).join(', ');

  const paper = {
    id: arxivId,
    arxivId,
    title,
    summary,
    year,
    published,
    authors: authors.join(', '),
    shortAuthors,
    categories,
    source,
    url: arxivId ? `https://arxiv.org/abs/${arxivId}` : '',
  };
  if (doi) paper.doi = doi;
  if (journalRef) paper.journal = journalRef;
  return paper;
}

function _text(entry, tag) {
  const el = entry.querySelector(tag);
  return el ? (el.textContent || '').trim() : '';
}

function _collapseWhitespace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function _lastName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}
