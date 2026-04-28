import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { searchSources, pickSources, getPreset } from '../../services/search.js';

const { DOMParser } = new JSDOM().window;
const parseXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml');

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <title>Test paper</title>
    <summary>Body</summary>
    <published>2024-01-15T18:00:00Z</published>
    <author><name>A. Adams</name></author>
  </entry>
</feed>`;

const SEARCH_CONFIG = {
  sources: [
    { id: 'arxiv', label: 'arXiv', type: 'arxiv', enabled: true },
    { id: 'prl', label: 'PRL', type: 'arxiv-jr', journalRef: 'Phys.+Rev.+Lett.', enabled: false },
    { id: 'prx', label: 'PRX', type: 'crossref', issn: '2160-3308', enabled: false },
  ],
  presets: [
    { id: 'p1', label: 'Preset 1', query: 'foo' },
  ],
};

describe('pickSources', () => {
  it('returns enabled sources by default', () => {
    expect(pickSources(SEARCH_CONFIG, []).map((s) => s.id)).toEqual(['arxiv']);
    expect(pickSources(SEARCH_CONFIG, undefined).map((s) => s.id)).toEqual(['arxiv']);
  });

  it('returns the requested ids regardless of enabled state', () => {
    expect(pickSources(SEARCH_CONFIG, ['prl']).map((s) => s.id)).toEqual(['prl']);
    expect(pickSources(SEARCH_CONFIG, ['arxiv', 'prx']).map((s) => s.id)).toEqual(['arxiv', 'prx']);
  });

  it('safely handles empty / missing config', () => {
    expect(pickSources(null, ['x'])).toEqual([]);
    expect(pickSources({}, ['x'])).toEqual([]);
  });
});

describe('getPreset', () => {
  it('returns the preset by id', () => {
    expect(getPreset(SEARCH_CONFIG, 'p1')).toEqual({ id: 'p1', label: 'Preset 1', query: 'foo' });
  });

  it('returns null for missing id', () => {
    expect(getPreset(SEARCH_CONFIG, 'xxx')).toBeNull();
  });
});

describe('searchSources', () => {
  it('empty query returns no papers and no errors', async () => {
    const r = await searchSources('', { searchConfig: SEARCH_CONFIG, fetch: () => {}, parseXml });
    expect(r).toEqual({ papers: [], errors: [] });
  });

  it('dispatches arxiv source through searchArxiv', async () => {
    let capturedUrl = null;
    const fakeFetch = async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => SAMPLE_ATOM };
    };
    const r = await searchSources('transmon', {
      searchConfig: SEARCH_CONFIG,
      sourceIds: ['arxiv'],
      fetch: fakeFetch,
      parseXml,
    });
    expect(capturedUrl).toContain('search_query=all:transmon');
    expect(r.papers).toHaveLength(1);
    expect(r.papers[0].source).toBe('arxiv');
    expect(r.errors).toEqual([]);
  });

  it('dispatches arxiv-jr source with journalRef filter', async () => {
    let capturedUrl = null;
    const fakeFetch = async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => SAMPLE_ATOM };
    };
    await searchSources('q', {
      searchConfig: SEARCH_CONFIG,
      sourceIds: ['prl'],
      fetch: fakeFetch,
      parseXml,
    });
    expect(capturedUrl).toContain('jr:Phys.+Rev.+Lett.');
  });

  it('captures per-source errors and continues with other sources', async () => {
    let calls = 0;
    const fakeFetch = async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 500, text: async () => '' };
      return { ok: true, status: 200, text: async () => SAMPLE_ATOM };
    };
    const r = await searchSources('q', {
      searchConfig: SEARCH_CONFIG,
      sourceIds: ['arxiv', 'prl'],
      fetch: fakeFetch,
      parseXml,
    });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].sourceId).toBe('arxiv');
    expect(r.papers).toHaveLength(1);
  });

  it('crossref dispatch requires opts.crossrefFetch', async () => {
    const r = await searchSources('q', {
      searchConfig: SEARCH_CONFIG,
      sourceIds: ['prx'],
      fetch: () => {},
      parseXml,
    });
    expect(r.errors[0].message).toMatch(/crossrefFetch/);
  });

  it('uses the provided crossrefFetch handler', async () => {
    const crossrefFetch = async (q, src) => {
      return [{ id: 'doi:1', title: q, source: src.id }];
    };
    const r = await searchSources('hello', {
      searchConfig: SEARCH_CONFIG,
      sourceIds: ['prx'],
      fetch: () => {},
      parseXml,
      crossrefFetch,
    });
    expect(r.errors).toEqual([]);
    expect(r.papers).toEqual([{ id: 'doi:1', title: 'hello', source: 'prx' }]);
  });

  it('dedupes papers with the same id across sources', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, text: async () => SAMPLE_ATOM });
    const r = await searchSources('q', {
      searchConfig: SEARCH_CONFIG,
      sourceIds: ['arxiv', 'prl'],
      fetch: fakeFetch,
      parseXml,
    });
    // Both sources return the same paper id (2401.12345); merge to one.
    expect(r.papers).toHaveLength(1);
  });

  it('rejects an unknown source type', async () => {
    const cfg = { sources: [{ id: 'x', type: 'made-up', enabled: true }] };
    const r = await searchSources('q', {
      searchConfig: cfg, sourceIds: ['x'], fetch: () => {}, parseXml,
    });
    expect(r.errors[0].message).toMatch(/unknown source type/);
  });
});
