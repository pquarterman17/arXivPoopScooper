/**
 * Database merge + collection export.
 *
 * Closes out plan #7 — extracts the last unported chunk of the legacy
 * db_utils.js IIFE into a DOM-free service. The legacy `exportCollectionDB`
 * triggered a download via `document.createElement('a')`; the new
 * `exportCollectionBytes` returns a `Uint8Array` so the UI layer decides
 * whether to download, POST it, etc.
 *
 * Merge rules (preserved verbatim from the legacy implementation; lock them
 * in via vectors before changing):
 *   - papers: new id → insert; existing → longer summary wins, tags/key_results
 *     unioned, blank fields filled from the other db, otherwise skipped
 *   - read_status: OR for is_read, max for priority
 *   - notes: newer last_edited wins (only if non-empty)
 *   - highlights: dedupe by (paper_id, text)
 *   - figures: dedupe by (paper_id, figure_key)
 *   - collections: dedupe by (name, paper_id)
 *   - paper_links: only carry over links where both ends exist locally
 *
 * No DOM. Safe to import in node.
 */

import { query, queryOne, run, getSQL } from '../core/db.js';

/**
 * Merge another sql.js DB (provided as raw bytes) into the current
 * in-memory DB. Returns counts so callers can show "added 3, updated 5,
 * skipped 0" toasts.
 *
 * @param {Uint8Array} otherDbBytes
 * @returns {{ added: number, updated: number, skipped: number }}
 */
export function mergeFromDatabase(otherDbBytes) {
  const SQL = getSQL();
  const other = new SQL.Database(otherDbBytes instanceof Uint8Array ? otherDbBytes : new Uint8Array(otherDbBytes));
  try {
    return _mergeImpl(other);
  } finally {
    other.close();
  }
}

/**
 * Read a `File` (from an `<input type=file>`) and merge it.
 * Convenience wrapper for the UI layer.
 */
export async function importDatabaseFile(file) {
  const buf = await file.arrayBuffer();
  return mergeFromDatabase(new Uint8Array(buf));
}

/**
 * Pack a single collection's papers (and all their related rows) into a
 * fresh, schema-isolated SQLite DB and return the bytes.
 *
 * The export-side DB needs the same schema as the main one. Pass it in as
 * `opts.schemaSQL` so this service doesn't need to fetch the migration
 * file — that's the UI's job (or a paths-aware wrapper). Tests pass an
 * inline minimal schema.
 *
 * @param {string} name
 * @param {object} opts
 * @param {string} opts.schemaSQL — DDL to bootstrap the export DB
 * @returns {Uint8Array | null} — null if the collection is empty
 */
export function exportCollectionBytes(name, opts = {}) {
  if (typeof opts.schemaSQL !== 'string' || !opts.schemaSQL.trim()) {
    throw new Error('[services/database-merge] exportCollectionBytes requires opts.schemaSQL');
  }
  const collPapers = query('SELECT paper_id FROM collections WHERE name = ?', [name]);
  if (collPapers.length === 0) return null;

  const ids = collPapers.map((r) => r.paper_id);
  const placeholders = ids.map(() => '?').join(',');

  const SQL = getSQL();
  const exp = new SQL.Database();
  try {
    exp.exec(opts.schemaSQL);

    _copyRows(exp, query(`SELECT * FROM papers WHERE id IN (${placeholders})`, ids), 'papers');
    _copyRows(exp, query(`SELECT * FROM figures WHERE paper_id IN (${placeholders})`, ids), 'figures', { skipCols: ['id'] });
    _copyRows(exp, query(`SELECT * FROM notes WHERE paper_id IN (${placeholders})`, ids), 'notes');
    _copyRows(exp, query(`SELECT * FROM highlights WHERE paper_id IN (${placeholders})`, ids), 'highlights', { skipCols: ['id'] });
    _copyRows(exp, query(`SELECT * FROM read_status WHERE paper_id IN (${placeholders})`, ids), 'read_status');

    // Single collection — emit by name regardless of what's stored
    for (const id of ids) {
      exp.run('INSERT INTO collections (name, paper_id) VALUES (?, ?)', [name, id]);
    }

    // Links: only between papers in the export
    const links = query(
      `SELECT * FROM paper_links WHERE paper_a IN (${placeholders}) AND paper_b IN (${placeholders})`,
      [...ids, ...ids],
    );
    for (const l of links) {
      exp.run('INSERT INTO paper_links (paper_a, paper_b) VALUES (?, ?)', [l.paper_a, l.paper_b]);
    }

    return exp.export();
  } finally {
    exp.close();
  }
}

// ─── internals ───

function _mergeImpl(other) {
  const stats = { added: 0, updated: 0, skipped: 0 };
  const oQuery = (sql, params = []) => {
    const stmt = other.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  };

  // 1. Papers
  for (const op of oQuery('SELECT * FROM papers')) {
    const existing = queryOne('SELECT * FROM papers WHERE id = ?', [op.id]);
    if (!existing) {
      run(
        `INSERT INTO papers (id, title, authors, short_authors, year, journal, volume,
                             pages, doi, arxiv_id, url, group_name, date_added, tags,
                             summary, key_results, cite_bib, cite_txt, pdf_path,
                             entry_type, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          op.id, op.title, op.authors, op.short_authors, op.year, op.journal,
          op.volume, op.pages, op.doi, op.arxiv_id, op.url, op.group_name,
          op.date_added, op.tags, op.summary, op.key_results, op.cite_bib,
          op.cite_txt, op.pdf_path, op.entry_type || 'preprint', op.created_at, op.updated_at,
        ],
      );
      run('INSERT OR IGNORE INTO read_status (paper_id) VALUES (?)', [op.id]);
      stats.added++;
      continue;
    }

    let changed = false;
    const newSummary = (op.summary || '').length > (existing.summary || '').length
      ? op.summary
      : existing.summary;
    const existingTags = _jsonParse(existing.tags, []);
    const otherTags = _jsonParse(op.tags, []);
    const mergedTags = [...new Set([...existingTags, ...otherTags])];
    const existingKR = _jsonParse(existing.key_results, []);
    const otherKR = _jsonParse(op.key_results, []);
    const mergedKR = [...new Set([...existingKR, ...otherKR])];
    const fillFields = ['journal', 'volume', 'pages', 'doi', 'url', 'group_name',
                        'cite_bib', 'cite_txt', 'pdf_path', 'entry_type'];
    const updates = {};
    for (const f of fillFields) {
      if ((!existing[f] || existing[f] === '') && op[f] && op[f] !== '') {
        updates[f] = op[f];
        changed = true;
      }
    }
    if (newSummary !== existing.summary) changed = true;
    if (JSON.stringify(mergedTags) !== JSON.stringify(existingTags)) changed = true;
    if (JSON.stringify(mergedKR) !== JSON.stringify(existingKR)) changed = true;

    if (!changed) { stats.skipped++; continue; }

    const setClauses = ['summary = ?', 'tags = ?', 'key_results = ?', "updated_at = datetime('now')"];
    const params = [newSummary, JSON.stringify(mergedTags), JSON.stringify(mergedKR)];
    for (const [k, v] of Object.entries(updates)) {
      setClauses.push(`${k} = ?`);
      params.push(v);
    }
    params.push(op.id);
    run(`UPDATE papers SET ${setClauses.join(', ')} WHERE id = ?`, params);
    stats.updated++;
  }

  // 2. read_status (OR is_read, max priority)
  for (const ors of oQuery('SELECT * FROM read_status')) {
    const existing = queryOne('SELECT * FROM read_status WHERE paper_id = ?', [ors.paper_id]);
    if (!existing) {
      run('INSERT OR IGNORE INTO read_status (paper_id, is_read, priority) VALUES (?,?,?)',
          [ors.paper_id, ors.is_read, ors.priority]);
    } else {
      const newRead = (existing.is_read || ors.is_read) ? 1 : 0;
      const newPriority = Math.max(existing.priority || 0, ors.priority || 0);
      if (newRead !== existing.is_read || newPriority !== existing.priority) {
        run('UPDATE read_status SET is_read = ?, priority = ? WHERE paper_id = ?',
            [newRead, newPriority, ors.paper_id]);
      }
    }
  }

  // 3. notes (newer last_edited wins, only if content non-empty)
  for (const on of oQuery('SELECT * FROM notes')) {
    const existing = queryOne('SELECT * FROM notes WHERE paper_id = ?', [on.paper_id]);
    if (!existing) {
      run('INSERT INTO notes (paper_id, content, last_edited) VALUES (?,?,?)',
          [on.paper_id, on.content, on.last_edited]);
    } else {
      const a = existing.last_edited ? new Date(existing.last_edited).getTime() : 0;
      const b = on.last_edited ? new Date(on.last_edited).getTime() : 0;
      if (b > a && on.content) {
        run('UPDATE notes SET content = ?, last_edited = ? WHERE paper_id = ?',
            [on.content, on.last_edited, on.paper_id]);
      }
    }
  }

  // 4. highlights (dedupe by paper_id + text)
  for (const oh of oQuery('SELECT * FROM highlights')) {
    const existing = queryOne(
      'SELECT id FROM highlights WHERE paper_id = ? AND text = ?',
      [oh.paper_id, oh.text],
    );
    if (!existing) {
      run('INSERT INTO highlights (paper_id, text, page, color) VALUES (?,?,?,?)',
          [oh.paper_id, oh.text, oh.page, oh.color]);
    }
  }

  // 5. figures (dedupe by paper_id + figure_key)
  for (const fg of oQuery('SELECT * FROM figures')) {
    const existing = queryOne(
      'SELECT id FROM figures WHERE paper_id = ? AND figure_key = ?',
      [fg.paper_id, fg.figure_key],
    );
    if (!existing) {
      run('INSERT INTO figures (paper_id, figure_key, file_path, label, caption, sort_order) VALUES (?,?,?,?,?,?)',
          [fg.paper_id, fg.figure_key, fg.file_path, fg.label, fg.caption, fg.sort_order]);
    }
  }

  // 6. collections (dedupe by name + paper_id)
  for (const oc of oQuery('SELECT * FROM collections')) {
    run('INSERT OR IGNORE INTO collections (name, paper_id) VALUES (?, ?)',
        [oc.name, oc.paper_id]);
  }

  // 7. paper_links (only carry over if both ends exist)
  for (const ol of oQuery('SELECT * FROM paper_links')) {
    const a = queryOne('SELECT id FROM papers WHERE id = ?', [ol.paper_a]);
    const b = queryOne('SELECT id FROM papers WHERE id = ?', [ol.paper_b]);
    if (a && b) {
      run('INSERT OR IGNORE INTO paper_links (paper_a, paper_b) VALUES (?, ?)',
          [ol.paper_a, ol.paper_b]);
    }
  }

  // Trigger an FTS rebuild (no-op when FTS isn't compiled, e.g. tests on
  // the npm sql.js build).
  try { run("INSERT INTO papers_fts(papers_fts) VALUES('rebuild')"); } catch (_) { /* fine */ }

  return stats;
}

function _copyRows(exp, rows, tableName, opts = {}) {
  if (rows.length === 0) return;
  const skip = new Set(opts.skipCols ?? []);
  const cols = Object.keys(rows[0]).filter((c) => !skip.has(c));
  const placeholders = cols.map(() => '?').join(',');
  const sql = `INSERT INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})`;
  for (const r of rows) {
    exp.run(sql, cols.map((c) => r[c]));
  }
}

function _jsonParse(s, fallback) {
  if (Array.isArray(s) || (s && typeof s === 'object')) return s;
  try { return JSON.parse(s); } catch { return fallback; }
}
