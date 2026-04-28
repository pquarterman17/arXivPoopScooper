/**
 * Paper links service. Bidirectional manual links — "this paper relates to
 * that paper". Stored canonically with paper_a < paper_b so each pair has
 * exactly one row regardless of insertion order.
 *
 * No DOM. Safe to import in node.
 */

import { query, run } from '../core/db.js';

/** Papers linked to `paperId`, in either direction. */
export function listForPaper(paperId) {
  return query(`
    SELECT p.id, p.title, p.short_authors, p.year
    FROM paper_links pl
    JOIN papers p ON (p.id = CASE WHEN pl.paper_a = ? THEN pl.paper_b ELSE pl.paper_a END)
    WHERE pl.paper_a = ? OR pl.paper_b = ?
  `, [paperId, paperId, paperId]);
}

/** Add a link. Idempotent; canonical ordering enforces uniqueness. */
export function add(idA, idB) {
  if (!idA || !idB) throw new Error('[services/links] both ids required');
  if (idA === idB) throw new Error('[services/links] cannot link a paper to itself');
  const [a, b] = [idA, idB].sort();
  run('INSERT OR IGNORE INTO paper_links (paper_a, paper_b) VALUES (?, ?)', [a, b]);
}

/** Remove a link in either direction. */
export function remove(idA, idB) {
  const [a, b] = [idA, idB].sort();
  run('DELETE FROM paper_links WHERE paper_a = ? AND paper_b = ?', [a, b]);
}

/** True if a link exists (either direction). */
export function exists(idA, idB) {
  if (idA === idB) return false;
  const [a, b] = [idA, idB].sort();
  return query(
    'SELECT 1 FROM paper_links WHERE paper_a = ? AND paper_b = ? LIMIT 1',
    [a, b],
  ).length > 0;
}
