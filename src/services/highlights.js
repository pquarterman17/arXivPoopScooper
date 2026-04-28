/**
 * Highlights service. Per-paper annotation snippets (with optional page
 * number and color). Used by the PDF reader pane.
 *
 * No DOM. Safe to import in node.
 */

import { query, queryOne, run } from '../core/db.js';

const DEFAULT_COLOR = '#58a6ff';

/** All highlights for a paper, oldest-first. */
export function listForPaper(paperId) {
  return query(
    'SELECT * FROM highlights WHERE paper_id = ? ORDER BY id',
    [paperId],
  );
}

/**
 * Add a highlight. Returns the new row's id (sql.js autoincrement).
 * Dedupes against same (paper_id, text) — re-highlighting the same exact
 * text is a no-op rather than producing a duplicate row.
 */
export function add(paperId, text, opts = {}) {
  if (!paperId || !text) throw new Error('[services/highlights] paperId and text required');
  const existing = queryOne(
    'SELECT id FROM highlights WHERE paper_id = ? AND text = ?',
    [paperId, text],
  );
  if (existing) return existing.id;
  run(
    'INSERT INTO highlights (paper_id, text, page, color) VALUES (?, ?, ?, ?)',
    [paperId, text, opts.page ?? null, opts.color ?? DEFAULT_COLOR],
  );
  const row = queryOne('SELECT last_insert_rowid() AS id');
  return row?.id ?? null;
}

/** Remove one highlight by id. */
export function remove(highlightId) {
  run('DELETE FROM highlights WHERE id = ?', [highlightId]);
}

/** Remove every highlight for a paper. Used when a paper is deleted. */
export function clearForPaper(paperId) {
  run('DELETE FROM highlights WHERE paper_id = ?', [paperId]);
}
