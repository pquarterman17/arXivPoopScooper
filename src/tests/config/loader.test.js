import { describe, it, expect } from 'vitest';
import {
  loadConfig, loadAll, deepMerge, validate, MANIFEST,
} from '../../config/loader.js';

/** Build a fake fetch that serves a virtual { url: payload } map. */
function makeFetch(map) {
  return async (url) => {
    const key = Object.keys(map).find((k) => url.endsWith(k));
    if (!key) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => map[key] };
  };
}

describe('deepMerge', () => {
  it('merges plain objects key-by-key', () => {
    expect(deepMerge({ a: 1, b: { c: 2 } }, { b: { d: 3 }, e: 4 })).toEqual({
      a: 1, b: { c: 2, d: 3 }, e: 4,
    });
  });

  it('replaces arrays (does not union)', () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [9] })).toEqual({ list: [9] });
  });

  it('replaces scalars', () => {
    expect(deepMerge({ a: 1, b: 'x' }, { a: 2 })).toEqual({ a: 2, b: 'x' });
  });

  it('does not mutate inputs', () => {
    const a = { nested: { x: 1 } };
    const b = { nested: { y: 2 } };
    deepMerge(a, b);
    expect(a).toEqual({ nested: { x: 1 } });
    expect(b).toEqual({ nested: { y: 2 } });
  });

  it('null override replaces', () => {
    expect(deepMerge({ a: 1 }, { a: null })).toEqual({ a: null });
  });
});

describe('validate', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1 },
      age: { type: 'integer', minimum: 0, maximum: 150 },
      tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      role: { type: 'string', enum: ['admin', 'user'] },
      email: { type: 'string', format: 'email' },
    },
  };

  it('accepts a valid object', () => {
    expect(validate({ name: 'a', age: 1 }, schema)).toEqual([]);
  });

  it('flags missing required keys', () => {
    const errs = validate({}, schema);
    expect(errs.some((e) => e.includes('name') && e.includes('required'))).toBe(true);
  });

  it('flags wrong type', () => {
    const errs = validate({ name: 'a', age: '21' }, schema);
    expect(errs.some((e) => e.includes('age') && e.includes('integer'))).toBe(true);
  });

  it('enforces enum values', () => {
    const errs = validate({ name: 'a', role: 'wizard' }, schema);
    expect(errs.some((e) => e.includes('role'))).toBe(true);
  });

  it('rejects unknown properties when additionalProperties=false', () => {
    const errs = validate({ name: 'a', extra: 1 }, schema);
    expect(errs.some((e) => e.includes('extra') && e.includes('unknown'))).toBe(true);
  });

  it('enforces uniqueItems', () => {
    const errs = validate({ name: 'a', tags: ['a', 'a'] }, schema);
    expect(errs.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('enforces email format', () => {
    expect(validate({ name: 'a', email: 'nope' }, schema).some((e) => e.includes('email'))).toBe(true);
    expect(validate({ name: 'a', email: 'a@b.co' }, schema)).toEqual([]);
  });

  it('respects min/max numeric bounds', () => {
    expect(validate({ name: 'a', age: -1 }, schema).some((e) => e.includes('minimum'))).toBe(true);
    expect(validate({ name: 'a', age: 200 }, schema).some((e) => e.includes('maximum'))).toBe(true);
  });

  it('handles anyOf', () => {
    const s = { anyOf: [{ const: '' }, { type: 'string', format: 'email' }] };
    expect(validate('', s)).toEqual([]);
    expect(validate('me@x.io', s)).toEqual([]);
    expect(validate('badly', s).length).toBeGreaterThan(0);
  });
});

describe('loadConfig', () => {
  const minimalDigestSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['cadence', 'maxPapers'],
    properties: {
      cadence: { type: 'string' },
      maxPapers: { type: 'integer', minimum: 1 },
      recipients: { type: 'array', items: { type: 'string' } },
    },
  };

  it('returns defaults when no override exists', async () => {
    const fetch = makeFetch({
      '/defaults/digest.json': { cadence: 'daily', maxPapers: 25 },
      '/schema/digest.schema.json': minimalDigestSchema,
    });
    const result = await loadConfig('digest', {
      fetch,
      defaultsBase: '/defaults/',
      overridesBase: '/overrides/',
      schemaBase: '/schema/',
    });
    expect(result.source).toBe('defaults');
    expect(result.data).toEqual({ cadence: 'daily', maxPapers: 25 });
    expect(result.errors).toEqual([]);
  });

  it('merges user override with defaults', async () => {
    const fetch = makeFetch({
      '/defaults/digest.json': { cadence: 'daily', maxPapers: 25, recipients: [] },
      '/overrides/digest.json': { maxPapers: 50, recipients: ['a@b.co'] },
      '/schema/digest.schema.json': minimalDigestSchema,
    });
    const result = await loadConfig('digest', {
      fetch,
      defaultsBase: '/defaults/',
      overridesBase: '/overrides/',
      schemaBase: '/schema/',
    });
    expect(result.source).toBe('merged');
    expect(result.data).toEqual({ cadence: 'daily', maxPapers: 50, recipients: ['a@b.co'] });
  });

  it('reports validation errors but still returns the data', async () => {
    const fetch = makeFetch({
      '/defaults/digest.json': { cadence: 'daily', maxPapers: 25 },
      '/overrides/digest.json': { maxPapers: 'lots' }, // wrong type
      '/schema/digest.schema.json': minimalDigestSchema,
    });
    const result = await loadConfig('digest', {
      fetch,
      defaultsBase: '/defaults/',
      overridesBase: '/overrides/',
      schemaBase: '/schema/',
    });
    expect(result.errors.some((e) => e.includes('maxPapers'))).toBe(true);
  });

  it('strips $schema before validation (it would fail additionalProperties=false otherwise)', async () => {
    const fetch = makeFetch({
      '/defaults/digest.json': { $schema: '../schema/digest.schema.json', cadence: 'daily', maxPapers: 25 },
      '/schema/digest.schema.json': minimalDigestSchema,
    });
    const result = await loadConfig('digest', {
      fetch,
      defaultsBase: '/defaults/',
      overridesBase: '/overrides/',
      schemaBase: '/schema/',
    });
    expect(result.errors).toEqual([]);
    expect(result.data.$schema).toBeUndefined();
  });

  it('rejects unknown domains', async () => {
    await expect(loadConfig('not-a-domain', { fetch: makeFetch({}) })).rejects.toThrow(/unknown domain/);
  });

  it('throws clearly when defaults file is missing', async () => {
    const fetch = makeFetch({
      '/schema/digest.schema.json': minimalDigestSchema,
    });
    await expect(loadConfig('digest', {
      fetch,
      defaultsBase: '/defaults/',
      overridesBase: '/overrides/',
      schemaBase: '/schema/',
    })).rejects.toThrow(/failed to fetch/);
  });
});

describe('the real shipped defaults', () => {
  // Smoke test: every shipped defaults file validates against its own schema.
  // Catches regressions where someone edits one and forgets the other.
  it('every domain in MANIFEST has matching defaults + schema that validate', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    for (const domain of MANIFEST) {
      const defaultsPath = path.resolve('src/config/defaults', `${domain}.json`);
      const schemaPath = path.resolve('src/config/schema', `${domain}.schema.json`);
      const defaults = JSON.parse(await fs.readFile(defaultsPath, 'utf8'));
      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
      const { $schema, ...payload } = defaults;
      const errors = validate(payload, schema);
      expect(errors, `${domain} defaults failed schema: ${errors.join('; ')}`).toEqual([]);
    }
  });
});

describe('loadAll', () => {
  it('loads every domain in parallel', async () => {
    // Build a fetch that serves all 7 domains using a permissive schema.
    const permissiveSchema = { type: 'object' };
    const map = {};
    for (const d of MANIFEST) {
      map[`/defaults/${d}.json`] = { domain: d };
      map[`/schema/${d}.schema.json`] = permissiveSchema;
    }
    const result = await loadAll({
      fetch: makeFetch(map),
      defaultsBase: '/defaults/',
      overridesBase: '/overrides/',
      schemaBase: '/schema/',
    });
    expect(Object.keys(result).sort()).toEqual([...MANIFEST].sort());
    for (const d of MANIFEST) {
      expect(result[d].data).toEqual({ domain: d });
    }
  });
});
