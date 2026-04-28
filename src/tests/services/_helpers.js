/**
 * Test helper: bootstrap an in-memory sql.js DB with the real schema.
 * Used by services tests so they exercise the same SQL the production
 * pages do.
 */

import initSqlJs from 'sql.js';
import * as db from '../../core/db.js';
import fs from 'node:fs/promises';
import path from 'node:path';

let _schema = null;

async function loadSchema() {
  if (_schema) return _schema;
  let raw = await fs.readFile(
    path.resolve('data/migrations/001_initial.sql'),
    'utf8',
  );
  // The npm sql.js build doesn't include FTS5 (the CDN one does). Strip the
  // FTS5 virtual tables and any triggers that reference them so tests run
  // against the same regular tables the production code falls back to when
  // FTS queries throw. The LIKE search path in services/papers.js is what
  // actually exercises real query logic.
  raw = raw.replace(
    /CREATE\s+VIRTUAL\s+TABLE[^;]*USING\s+fts5[^;]*;/gi,
    '',
  );
  // Strip any CREATE TRIGGER blocks that reference papers_fts (multi-statement
  // blocks ending with END;).
  raw = raw.replace(
    /CREATE\s+TRIGGER[^;]+papers_fts[\s\S]*?END\s*;/gi,
    '',
  );
  _schema = raw;
  return _schema;
}

/** Reset core/db, build a fresh in-memory DB with the real schema. */
export async function freshDB() {
  db._reset();
  await db.createEmpty({ initSqlJs });
  const schema = await loadSchema();
  db.exec(schema);
  return db;
}

/** Seed a paper with sane defaults. Returns its id. */
export function seedPaper(p = {}) {
  const id = p.id ?? '2401.00000';
  db.run(
    `INSERT INTO papers (id, title, authors, short_authors, year, summary, tags,
                         arxiv_id, date_added, entry_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      p.title ?? 'Test paper',
      p.authors ?? 'A. Author',
      p.short_authors ?? 'Author',
      p.year ?? 2024,
      p.summary ?? 'A summary',
      JSON.stringify(p.tags ?? []),
      id,
      p.date_added ?? '2024-01-15',
      p.entry_type ?? 'preprint',
    ],
  );
  db.run('INSERT OR IGNORE INTO read_status (paper_id) VALUES (?)', [id]);
  return id;
}

export { db };
