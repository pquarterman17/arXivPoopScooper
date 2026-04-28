import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs from 'sql.js';
import * as db from '../../core/db.js';

const SCHEMA = `
  CREATE TABLE papers (id TEXT PRIMARY KEY, title TEXT NOT NULL);
  CREATE TABLE notes (paper_id TEXT, content TEXT);
`;

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, v); }
  removeItem(k) { this.map.delete(k); }
}

async function freshDB() {
  db._reset();
  await db.createEmpty({ initSqlJs });
  db.exec(SCHEMA);
}

describe('core/db', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  it('init() throws a clear error when sql.js is unavailable', async () => {
    db._reset();
    await expect(db.init({ initSqlJs: undefined })).rejects.toThrow(/initSqlJs/);
  });

  it('query helpers throw if init/createEmpty was not called', () => {
    db._reset();
    expect(() => db.query('SELECT 1')).toThrow(/not initialized/);
  });

  it('run + query roundtrip', () => {
    db.run("INSERT INTO papers (id, title) VALUES (?, ?)", ['1', 'A']);
    db.run("INSERT INTO papers (id, title) VALUES (?, ?)", ['2', 'B']);
    expect(db.query('SELECT id, title FROM papers ORDER BY id')).toEqual([
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
    ]);
  });

  it('queryOne returns first row or null', () => {
    db.run("INSERT INTO papers (id, title) VALUES ('x', 'X')");
    expect(db.queryOne('SELECT title FROM papers WHERE id = ?', ['x'])).toEqual({ title: 'X' });
    expect(db.queryOne('SELECT title FROM papers WHERE id = ?', ['nope'])).toBeNull();
  });

  it('scalar returns a single value', () => {
    db.run("INSERT INTO papers (id, title) VALUES ('1','A')");
    db.run("INSERT INTO papers (id, title) VALUES ('2','B')");
    expect(db.scalar('SELECT COUNT(*) FROM papers')).toBe(2);
  });

  it('marks dirty after run, clears after save', () => {
    expect(db.isDirty()).toBe(false);
    db.run("INSERT INTO papers (id, title) VALUES ('x','X')");
    expect(db.isDirty()).toBe(true);
    db.save({ storage: new FakeStorage() });
    expect(db.isDirty()).toBe(false);
  });

  it('exportBytes returns a non-empty Uint8Array', () => {
    db.run("INSERT INTO papers (id, title) VALUES ('x','X')");
    const bytes = db.exportBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('loadFromBytes replaces the in-memory DB', async () => {
    db.run("INSERT INTO papers (id, title) VALUES ('x','X')");
    const bytes = db.exportBytes();
    db._reset();
    await db.createEmpty({ initSqlJs });
    db.exec(SCHEMA);
    expect(db.scalar('SELECT COUNT(*) FROM papers')).toBe(0);
    await db.loadFromBytes(bytes, { initSqlJs });
    expect(db.scalar('SELECT COUNT(*) FROM papers')).toBe(1);
  });

  it('init() loads from HTTP fetch when available', async () => {
    // Build a real sqlite blob in memory, then have a fake fetch return it.
    db.run("INSERT INTO papers (id, title) VALUES ('h','via http')");
    const bytes = db.exportBytes();
    db._reset();
    const storage = new FakeStorage();
    const fakeFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer });
    await db.init({ initSqlJs, fetch: fakeFetch, storage });
    expect(db.scalar('SELECT title FROM papers')).toBe('via http');
  });

  it('init() falls back to localStorage cache when fetch fails', async () => {
    db.run("INSERT INTO papers (id, title) VALUES ('c','via cache')");
    const bytes = db.exportBytes();
    db._reset();
    // Seed the cache with the bytes (using the same b64 form db.js uses)
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const storage = new FakeStorage();
    storage.setItem('scq-db-base64', Buffer.from(binary, 'binary').toString('base64'));
    const fakeFetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    await db.init({ initSqlJs, fetch: fakeFetch, storage });
    expect(db.scalar('SELECT title FROM papers')).toBe('via cache');
  });

  it('init() throws clearly when neither fetch nor cache succeed', async () => {
    db._reset();
    const storage = new FakeStorage();
    const fakeFetch = async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) });
    await expect(db.init({ initSqlJs, fetch: fakeFetch, storage })).rejects.toThrow(/Could not load/);
  });
});
