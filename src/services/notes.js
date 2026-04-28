/**
 * Notes service. One-note-per-paper key-value store.
 *
 * Reads from / writes to the `notes` table; backed by core/db. Joined into
 * the canonical paper view by services/papers.js (so callers usually don't
 * read this directly — only the notes editor needs `set()`).
 *
 * No DOM. Safe to import in node.
 */

import { query, queryOne, run } from '../core/db.js';

/** @returns {{ paper_id, content, last_edited } | null} */
export function get(paperId) {
  return queryOne('SELECT * FROM notes WHERE paper_id = ?', [paperId]);
}

/** Set or replace a paper's note. Stamps `last_edited` with the current ISO time. */
export function set(paperId, content) {
  const ts = new Date().toISOString();
  run(
    'INSERT OR REPLACE INTO notes (paper_id, content, last_edited) VALUES (?, ?, ?)',
    [paperId, content, ts],
  );
  return ts;
}

export function remove(paperId) {
  run('DELETE FROM notes WHERE paper_id = ?', [paperId]);
}

/** All notes, most-recent first. Used by export and "recent activity" views. */
export function listRecent(limit = 50) {
  return query(
    `SELECT n.*, p.title FROM notes n
     JOIN papers p ON p.id = n.paper_id
     WHERE n.content IS NOT NULL AND TRIM(n.content) != ''
     ORDER BY n.last_edited DESC
     LIMIT ?`,
    [limit],
  );
}
