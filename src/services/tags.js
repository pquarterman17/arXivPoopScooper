/**
 * Tags service. Tags are stored as JSON arrays inside papers.tags, so
 * cross-paper operations (rename, delete, count) require a scan + rewrite.
 *
 * For per-paper tag mutations (add/remove a tag to a single paper) we read
 * the row, modify the array, and write back — a tiny transaction in
 * application code.
 *
 * No DOM. Safe to import in node.
 */

import { query, queryOne, run } from '../core/db.js';

/** All tags with their paper counts, ordered by frequency. */
export function counts() {
  const rows = query('SELECT tags FROM papers');
  const c = {};
  for (const r of rows) {
    const tags = _parse(r.tags);
    for (const t of tags) c[t] = (c[t] || 0) + 1;
  }
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

/** All distinct tag strings, alphabetical. */
export function listAll() {
  const rows = query('SELECT tags FROM papers');
  const set = new Set();
  for (const r of rows) for (const t of _parse(r.tags)) set.add(t);
  return [...set].sort();
}

/** Tags on a single paper, parsed. */
export function getForPaper(paperId) {
  const row = queryOne('SELECT tags FROM papers WHERE id = ?', [paperId]);
  return row ? _parse(row.tags) : [];
}

/** Add a tag to a paper (idempotent). Returns the new tag list. */
export function addToPaper(paperId, tag) {
  const tags = getForPaper(paperId);
  if (tags.includes(tag)) return tags;
  const next = [...tags, tag];
  run('UPDATE papers SET tags = ? WHERE id = ?', [JSON.stringify(next), paperId]);
  return next;
}

/** Remove a tag from a paper. Returns the new tag list. */
export function removeFromPaper(paperId, tag) {
  const tags = getForPaper(paperId);
  const next = tags.filter((t) => t !== tag);
  if (next.length === tags.length) return tags;
  run('UPDATE papers SET tags = ? WHERE id = ?', [JSON.stringify(next), paperId]);
  return next;
}

/** Set the tag list for a paper outright. Dedupes input. */
export function setForPaper(paperId, tags) {
  const unique = [...new Set(Array.isArray(tags) ? tags : [])];
  run('UPDATE papers SET tags = ? WHERE id = ?', [JSON.stringify(unique), paperId]);
  return unique;
}

/** Rename a tag everywhere. */
export function rename(oldTag, newTag) {
  if (oldTag === newTag) return 0;
  const rows = query("SELECT id, tags FROM papers WHERE tags LIKE '%' || ? || '%'", [oldTag]);
  let touched = 0;
  for (const r of rows) {
    const tags = _parse(r.tags);
    const idx = tags.indexOf(oldTag);
    if (idx === -1) continue;
    tags[idx] = newTag;
    const unique = [...new Set(tags)];
    run('UPDATE papers SET tags = ? WHERE id = ?', [JSON.stringify(unique), r.id]);
    touched++;
  }
  return touched;
}

/** Delete a tag everywhere. Returns the number of papers modified. */
export function deleteEverywhere(tag) {
  const rows = query("SELECT id, tags FROM papers WHERE tags LIKE '%' || ? || '%'", [tag]);
  let touched = 0;
  for (const r of rows) {
    const tags = _parse(r.tags);
    const filtered = tags.filter((t) => t !== tag);
    if (filtered.length === tags.length) continue;
    run('UPDATE papers SET tags = ? WHERE id = ?', [JSON.stringify(filtered), r.id]);
    touched++;
  }
  return touched;
}

function _parse(s) {
  if (Array.isArray(s)) return s;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
