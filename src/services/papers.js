/**
 * Papers service — paper CRUD over core/db.
 *
 * Replaces the paper-related portion of the legacy db_utils.js IIFE. Joins
 * the canonical view with `read_status` (1:1) and `notes` (1:1). Multi-row
 * relations (figures, highlights, links, collections) are loaded by their
 * own services and stitched in by getById().
 *
 * Tag and key_result JSON columns are parsed/serialized at the boundary so
 * callers see arrays, not strings.
 *
 * No DOM. Safe to import in node (with sql.js available).
 */

import { query, queryOne, scalar, run } from '../core/db.js';

// ─── Reads ───

/** All papers, most-recently-added first. Joined with read_status + notes (1:1). */
export function listAll() {
  return _hydrateRows(query(`
    SELECT p.*, rs.is_read, rs.priority, n.content AS note, n.last_edited
    FROM papers p
    LEFT JOIN read_status rs ON rs.paper_id = p.id
    LEFT JOIN notes n ON n.paper_id = p.id
    ORDER BY p.date_added DESC
  `));
}

/**
 * Single paper, fully hydrated.
 * Tag and key_results JSON are parsed; multi-row relations are NOT loaded
 * here — pass `{ withRelations: true }` to also fetch figures / highlights /
 * collections / links via direct SQL (kept inline so callers don't need the
 * full set of related-row services to be up).
 */
export function getById(id, opts = {}) {
  const row = queryOne(`
    SELECT p.*, rs.is_read, rs.priority, n.content AS note, n.last_edited
    FROM papers p
    LEFT JOIN read_status rs ON rs.paper_id = p.id
    LEFT JOIN notes n ON n.paper_id = p.id
    WHERE p.id = ?
  `, [id]);
  if (!row) return null;
  const paper = _hydrate(row);
  if (opts.withRelations) {
    paper.figures = query('SELECT * FROM figures WHERE paper_id = ? ORDER BY sort_order', [id]);
    paper.highlights = query('SELECT * FROM highlights WHERE paper_id = ? ORDER BY id', [id]);
    paper.collections = query('SELECT name FROM collections WHERE paper_id = ?', [id]).map((r) => r.name);
    paper.links = query(`
      SELECT p.id, p.title, p.short_authors, p.year
      FROM paper_links pl
      JOIN papers p ON (p.id = CASE WHEN pl.paper_a = ? THEN pl.paper_b ELSE pl.paper_a END)
      WHERE pl.paper_a = ? OR pl.paper_b = ?
    `, [id, id, id]);
  }
  return paper;
}

/**
 * Search papers via FTS (with LIKE fallback). Returns the same joined view
 * as listAll(), filtered to matches.
 *
 * Empty / whitespace query → returns all papers (matches legacy behavior).
 */
export function search(queryStr) {
  if (!queryStr || !queryStr.trim()) return listAll();
  const q = queryStr.trim();
  const matchedIds = new Set();

  // Try FTS first
  try {
    const ftsQ = q.replace(/['"(){}[\]*:^~!@#$%&]/g, ' ').trim();
    if (ftsQ) {
      const rows = query(
        'SELECT id FROM papers_fts WHERE papers_fts MATCH ?',
        [ftsQ + '*'],
      );
      rows.forEach((r) => matchedIds.add(r.id));
    }
  } catch (e) {
    console.warn('[services/papers] FTS query failed; using LIKE fallback:', e.message);
  }

  // Always also do LIKE — catches partial matches FTS misses (and substring of authors)
  const likeQ = '%' + q + '%';
  const likeRows = query(`
    SELECT id FROM papers
    WHERE title LIKE ? OR authors LIKE ? OR summary LIKE ? OR tags LIKE ? OR short_authors LIKE ?
  `, [likeQ, likeQ, likeQ, likeQ, likeQ]);
  likeRows.forEach((r) => matchedIds.add(r.id));

  if (matchedIds.size === 0) return [];
  const ids = [...matchedIds];
  const placeholders = ids.map(() => '?').join(',');
  return _hydrateRows(query(`
    SELECT p.*, rs.is_read, rs.priority, n.content AS note, n.last_edited
    FROM papers p
    LEFT JOIN read_status rs ON rs.paper_id = p.id
    LEFT JOIN notes n ON n.paper_id = p.id
    WHERE p.id IN (${placeholders})
    ORDER BY p.date_added DESC
  `, ids));
}

/** Top-level stats for the dashboard. Survives missing FTS tables. */
export function getStats() {
  return {
    papers: scalar('SELECT COUNT(*) FROM papers') ?? 0,
    read: scalar('SELECT COUNT(*) FROM read_status WHERE is_read = 1') ?? 0,
    unread: scalar('SELECT COUNT(*) FROM read_status WHERE is_read = 0 OR is_read IS NULL') ?? 0,
    figures: scalar('SELECT COUNT(*) FROM figures') ?? 0,
    collections: scalar('SELECT COUNT(DISTINCT name) FROM collections') ?? 0,
    pdfPages: _safeCount('SELECT COUNT(*) FROM pdf_text'),
  };
}

function _safeCount(sql) {
  try { return scalar(sql) ?? 0; }
  catch (_) { return 0; }
}

// ─── Writes ───

/**
 * Insert or replace a paper. Coerces a few legacy field aliases (camelCase
 * variants from older code paths) into the canonical snake_case columns.
 * Ensures a read_status row exists. Triggers an FTS rebuild.
 */
export function insert(p) {
  if (!p || !p.id) throw new Error('[services/papers] insert: paper.id is required');
  run(`
    INSERT OR REPLACE INTO papers
    (id, title, authors, short_authors, year, journal, volume, pages, doi, arxiv_id, url,
     group_name, date_added, tags, summary, key_results, cite_bib, cite_txt, pdf_path, entry_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    p.id,
    p.title || '',
    p.authors || '',
    p.shortAuthors || p.short_authors || '',
    p.year || 0,
    p.journal || '',
    p.volume || '',
    p.pages || '',
    p.doi || '',
    p.arxiv_id || p.arxivId || p.id,
    p.url || '',
    p.group || p.group_name || '',
    p.dateAdded || p.date_added || new Date().toISOString().slice(0, 10),
    JSON.stringify(p.tags || []),
    p.summary || '',
    JSON.stringify(p.keyResults || p.key_results || []),
    p.citeBib || p.cite_bib || '',
    p.citeTxt || p.cite_txt || '',
    p.pdf_path || p.pdfPath || '',
    p.entry_type || p.entryType || 'preprint',
  ]);
  run('INSERT OR IGNORE INTO read_status (paper_id) VALUES (?)', [p.id]);
  _rebuildFts();
}

/**
 * Patch a paper. Only the listed columns are updatable here — everything
 * else (notes, read status, tags) lives in its own service.
 */
export function update(id, patch) {
  if (!id) throw new Error('[services/papers] update: id is required');
  if (!patch || typeof patch !== 'object') return;
  const cols = [
    'title', 'authors', 'short_authors', 'year', 'journal', 'volume', 'pages',
    'doi', 'arxiv_id', 'url', 'group_name', 'tags', 'summary', 'key_results',
    'cite_bib', 'cite_txt', 'pdf_path', 'entry_type',
  ];
  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(patch)) {
    const col = _camelToSnake(key);
    if (!cols.includes(col)) continue;
    if (col === 'tags' || col === 'key_results') {
      sets.push(`${col} = ?`);
      params.push(Array.isArray(value) ? JSON.stringify(value) : (value ?? ''));
    } else {
      sets.push(`${col} = ?`);
      params.push(value ?? '');
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  params.push(id);
  run(`UPDATE papers SET ${sets.join(', ')} WHERE id = ?`, params);
  _rebuildFts();
}

/**
 * Cascading delete. Cleans up all 1:N tables manually so this works whether
 * or not SQLite FK enforcement is on (the browser sql.js path doesn't enable
 * it; the Python path does).
 */
export function remove(id) {
  if (!id) throw new Error('[services/papers] remove: id is required');
  run('DELETE FROM figures WHERE paper_id = ?', [id]);
  run('DELETE FROM notes WHERE paper_id = ?', [id]);
  run('DELETE FROM highlights WHERE paper_id = ?', [id]);
  run('DELETE FROM collections WHERE paper_id = ?', [id]);
  run('DELETE FROM paper_links WHERE paper_a = ? OR paper_b = ?', [id, id]);
  run('DELETE FROM read_status WHERE paper_id = ?', [id]);
  run('DELETE FROM papers WHERE id = ?', [id]);
  _rebuildFts();
}

/** Does this id exist? */
export function exists(id) {
  return scalar('SELECT 1 FROM papers WHERE id = ?', [id]) === 1;
}

// ─── internals ───

function _hydrate(row) {
  if (!row) return row;
  return {
    ...row,
    tags: _parseJson(row.tags, []),
    key_results: _parseJson(row.key_results, []),
    is_read: row.is_read ?? 0,
    priority: row.priority ?? 0,
  };
}

function _hydrateRows(rows) {
  return rows.map(_hydrate);
}

function _parseJson(s, fallback) {
  if (Array.isArray(s) || (s && typeof s === 'object')) return s; // already parsed
  try { return JSON.parse(s); } catch { return fallback; }
}

function _rebuildFts() {
  try { run("INSERT INTO papers_fts(papers_fts) VALUES('rebuild')"); }
  catch (e) { /* table missing in tests — ignore */ }
}

function _camelToSnake(s) {
  return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}
