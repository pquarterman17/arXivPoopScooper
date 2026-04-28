/**
 * Settings KV service. Typed read/write over the `settings` table.
 *
 * This is for ad-hoc UI/session preferences ("ui.theme", "lastOpenTab",
 * "tableSort"). It is NOT a replacement for `core/config.js` — that handles
 * structured, schema-validated config files in data/user_config/. Settings
 * is the simpler key→JSON store bound to the database.
 *
 * Convention: keys are dotted strings ("ui.theme", "scraper.lastQuery").
 * Values are JSON-serialized so anything that round-trips through JSON works.
 *
 * No DOM. Safe to import in node.
 */

import { query, queryOne, run } from '../core/db.js';

/** Get one setting; returns null if unset or stored value is unparseable. */
export function get(key, fallback = null) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value); }
  catch { return fallback; }
}

/** Set or replace a setting. Pass any JSON-serializable value. */
export function set(key, value) {
  if (typeof key !== 'string' || !key) {
    throw new Error('[services/settings] key must be a non-empty string');
  }
  run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, JSON.stringify(value)],
  );
}

/** Delete a setting (next get() returns the fallback). */
export function remove(key) {
  run('DELETE FROM settings WHERE key = ?', [key]);
}

/** Map of every setting, parsed. Best for "load on app boot" + cache. */
export function getAll() {
  const rows = query('SELECT key, value FROM settings');
  const out = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); }
    catch { /* skip corrupt entries */ }
  }
  return out;
}

/** Return all settings whose keys start with `prefix.`. */
export function getNamespace(prefix) {
  const all = getAll();
  const cut = prefix.endsWith('.') ? prefix : prefix + '.';
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(cut)) out[k.slice(cut.length)] = v;
  }
  return out;
}
