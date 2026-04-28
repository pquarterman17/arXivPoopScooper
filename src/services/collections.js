/**
 * Collections service. Named groups of papers; many-to-many.
 *
 * Backed by the `collections` table (name, paper_id) — composite PK so a
 * paper can belong to multiple collections.
 *
 * No DOM. Safe to import in node.
 */

import { query, run } from '../core/db.js';

/** All distinct collection names, alphabetical. */
export function listNames() {
  return query('SELECT DISTINCT name FROM collections ORDER BY name').map((r) => r.name);
}

/** Names with paper counts. Useful for the sidebar. */
export function listWithCounts() {
  return query(`
    SELECT name, COUNT(paper_id) AS count
    FROM collections
    GROUP BY name
    ORDER BY name
  `);
}

/** Papers in one collection, joined with read status, newest-added first. */
export function listPapers(name) {
  return query(`
    SELECT p.*, rs.is_read, rs.priority
    FROM papers p
    JOIN collections c ON c.paper_id = p.id
    LEFT JOIN read_status rs ON rs.paper_id = p.id
    WHERE c.name = ?
    ORDER BY p.date_added DESC
  `, [name]);
}

/** Collection names a single paper is in. */
export function listForPaper(paperId) {
  return query(
    'SELECT name FROM collections WHERE paper_id = ? ORDER BY name',
    [paperId],
  ).map((r) => r.name);
}

/** Add a paper to a collection. Idempotent (INSERT OR IGNORE). */
export function add(name, paperId) {
  if (!name || !paperId) throw new Error('[services/collections] name and paperId required');
  run('INSERT OR IGNORE INTO collections (name, paper_id) VALUES (?, ?)', [name, paperId]);
}

/** Remove a single paper from a collection. */
export function remove(name, paperId) {
  run('DELETE FROM collections WHERE name = ? AND paper_id = ?', [name, paperId]);
}

/** Rename a collection. No-op if newName already exists for one of the same papers. */
export function rename(oldName, newName) {
  if (oldName === newName) return;
  run('UPDATE OR IGNORE collections SET name = ? WHERE name = ?', [newName, oldName]);
  // Anything that couldn't move (newName already had that paper) is a duplicate
  // and gets dropped:
  run('DELETE FROM collections WHERE name = ?', [oldName]);
}

/** Delete a collection entirely (does not delete the papers). */
export function deleteAll(name) {
  run('DELETE FROM collections WHERE name = ?', [name]);
}
