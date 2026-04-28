/**
 * Read-status service. Tracks per-paper read flag and priority (0-3 stars).
 *
 * Backed by core/db, table `read_status` (paper_id PK, is_read int, priority int).
 * Most reads happen via services/papers.js's joined paper view; this module
 * exposes the writes plus a few targeted queries.
 *
 * No DOM. Safe to import in node.
 */

import { query, queryOne, run } from '../core/db.js';

/** @returns {{ is_read, priority } | null} */
export function get(paperId) {
  return queryOne(
    'SELECT is_read, priority FROM read_status WHERE paper_id = ?',
    [paperId],
  );
}

/** Set the read flag while preserving the existing priority. */
export function setRead(paperId, isRead) {
  run(
    `INSERT OR REPLACE INTO read_status (paper_id, is_read, priority)
     VALUES (?, ?, COALESCE((SELECT priority FROM read_status WHERE paper_id = ?), 0))`,
    [paperId, isRead ? 1 : 0, paperId],
  );
}

/** Set priority while preserving the existing read flag. Priority is 0-3 (stars). */
export function setPriority(paperId, priority) {
  if (typeof priority !== 'number' || priority < 0 || priority > 3) {
    throw new Error(`[services/read-status] priority must be 0-3, got ${priority}`);
  }
  run(
    `INSERT OR REPLACE INTO read_status (paper_id, is_read, priority)
     VALUES (?, COALESCE((SELECT is_read FROM read_status WHERE paper_id = ?), 0), ?)`,
    [paperId, paperId, priority],
  );
}

/** Ensure a row exists (called on paper insert; harmless to re-call). */
export function ensure(paperId) {
  run('INSERT OR IGNORE INTO read_status (paper_id) VALUES (?)', [paperId]);
}

/** Count read vs unread for the stats dashboard. */
export function counts() {
  const total = queryOne('SELECT COUNT(*) AS n FROM papers')?.n ?? 0;
  const read = queryOne('SELECT COUNT(*) AS n FROM read_status WHERE is_read = 1')?.n ?? 0;
  return { total, read, unread: total - read };
}

/** All papers with priority >= min, most-prioritized first. Used for the reading list. */
export function highPriorityPapers(minPriority = 1) {
  return query(
    `SELECT rs.paper_id, rs.priority, p.title, p.short_authors, p.year
     FROM read_status rs
     JOIN papers p ON p.id = rs.paper_id
     WHERE rs.priority >= ?
     ORDER BY rs.priority DESC, p.date_added DESC`,
    [minPriority],
  );
}
