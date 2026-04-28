import { describe, it, expect } from 'vitest';
import { saveDbToServer } from '../../services/database-sync.js';

describe('services/database-sync', () => {
  it('POSTs the bytes as octet-stream to /api/save-db', async () => {
    let captured = null;
    const fakeFetch = async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, bytes: 4, path: '/x', savedAt: '2026-04-28T00:00:00.000Z' }),
      };
    };
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await saveDbToServer(bytes, { fetch: fakeFetch });

    expect(captured.url).toBe('/api/save-db');
    expect(captured.init.method).toBe('POST');
    expect(captured.init.headers['Content-Type']).toBe('application/octet-stream');
    expect(captured.init.body).toBe(bytes);
    expect(result).toEqual({
      ok: true, bytes: 4, path: '/x', savedAt: '2026-04-28T00:00:00.000Z',
    });
  });

  it('rejects non-Uint8Array input', async () => {
    await expect(saveDbToServer('a string', { fetch: () => {} }))
      .rejects.toThrow(/Uint8Array/);
    await expect(saveDbToServer([1, 2, 3], { fetch: () => {} }))
      .rejects.toThrow(/Uint8Array/);
  });

  it('rejects empty bytes', async () => {
    await expect(saveDbToServer(new Uint8Array(0), { fetch: () => {} }))
      .rejects.toThrow(/empty/);
  });

  it('throws with the server error message on HTTP failure', async () => {
    const fakeFetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'magic header mismatch' }),
    });
    await expect(saveDbToServer(new Uint8Array([1, 2, 3]), { fetch: fakeFetch }))
      .rejects.toThrow(/magic header mismatch/);
  });

  it('falls back to HTTP status when the server response is not JSON', async () => {
    const fakeFetch = async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new Error('not json'); },
    });
    await expect(saveDbToServer(new Uint8Array([1, 2, 3]), { fetch: fakeFetch }))
      .rejects.toThrow(/HTTP 502/);
  });

  it('rejects malformed success response (missing ok=true)', async () => {
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ bytes: 100 }),  // missing ok
    });
    await expect(saveDbToServer(new Uint8Array([1, 2, 3]), { fetch: fakeFetch }))
      .rejects.toThrow(/ok=true/);
  });

  it('throws when no fetch is available', async () => {
    // Node 18+ has globalThis.fetch out of the box, so we have to stub it
    // for this test to actually exercise the "no fetch" branch.
    const orig = globalThis.fetch;
    globalThis.fetch = undefined;
    try {
      await expect(saveDbToServer(new Uint8Array([1, 2, 3]), { fetch: undefined }))
        .rejects.toThrow(/no fetch/);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
