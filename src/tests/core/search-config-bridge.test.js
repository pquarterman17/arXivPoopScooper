import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applySearchConfig, bootstrapSearchConfig } from '../../core/search-config-bridge.js';
import { _reset } from '../../core/config.js';
import { MANIFEST } from '../../config/loader.js';
import bus from '../../core/events.js';

const PERMISSIVE = { type: 'object' };

function makeFetch(map) {
  return async (url) => {
    const key = Object.keys(map).find((k) => url.endsWith(k));
    if (!key) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => map[key] };
  };
}

function buildMap(searchSources) {
  const map = {};
  for (const d of MANIFEST) {
    map[`/defaults/${d}.json`] = d === 'search-sources' ? searchSources : { domain: d };
    map[`/schema/${d}.schema.json`] = PERMISSIVE;
  }
  return map;
}

describe('applySearchConfig', () => {
  it('converts the array-of-sources schema to the legacy id-keyed map', () => {
    const target = { sources: { stale: {} } };
    applySearchConfig(target, {
      sources: [
        { id: 'arxiv', label: 'arXiv', color: '#58a6ff', enabled: true, type: 'arxiv' },
        { id: 'prl', label: 'PRL', color: '#bc8cff', enabled: false, type: 'arxiv-jr',
          journalRef: 'Phys.+Rev.+Lett.', journalName: 'Phys. Rev. Lett.' },
        { id: 'prb', label: 'PRB', color: '#d19a66', enabled: false, type: 'crossref',
          issn: '2469-9950', journalName: 'Phys. Rev. B' },
      ],
    });
    expect(Object.keys(target.sources).sort()).toEqual(['arxiv', 'prb', 'prl']);
    expect(target.sources.arxiv).toEqual({
      label: 'arXiv', color: '#58a6ff', enabled: true, type: 'arxiv',
    });
    expect(target.sources.prl).toMatchObject({
      type: 'arxiv-jr', journalRef: 'Phys.+Rev.+Lett.', journalName: 'Phys. Rev. Lett.',
    });
    expect(target.sources.prb).toMatchObject({ type: 'crossref', issn: '2469-9950' });
    // Optional fields stay absent on entries that don't carry them.
    expect('journalRef' in target.sources.arxiv).toBe(false);
    expect('issn' in target.sources.prl).toBe(false);
  });

  it('replaces presets and arxivCategories with the merged arrays', () => {
    const target = { presets: [{ label: 'old' }], arxivCategories: ['stale'] };
    applySearchConfig(target, {
      presets: [{ label: 'new', query: 'q' }],
      arxivCategories: ['quant-ph', 'cond-mat.supr-con'],
    });
    expect(target.presets).toEqual([{ label: 'new', query: 'q' }]);
    expect(target.arxivCategories).toEqual(['quant-ph', 'cond-mat.supr-con']);
  });

  it('shallow-merges autoFetch onto the existing object', () => {
    const target = { autoFetch: { delayBetweenQueries: 1500, otherKey: 'keep' } };
    applySearchConfig(target, { autoFetch: { delayBetweenQueries: 3000 } });
    expect(target.autoFetch).toEqual({ delayBetweenQueries: 3000, otherKey: 'keep' });
  });

  it('skips sources entries missing an id (defensive)', () => {
    const target = { sources: {} };
    applySearchConfig(target, {
      sources: [
        { id: 'ok', label: 'ok', enabled: true },
        { label: 'no-id' },
        null,
      ],
    });
    expect(Object.keys(target.sources)).toEqual(['ok']);
  });

  it('no-ops when target or merged is missing', () => {
    expect(() => applySearchConfig(null, { sources: [] })).not.toThrow();
    expect(() => applySearchConfig({}, null)).not.toThrow();
  });

  it('leaves untouched fields alone', () => {
    const target = { name: 'SCQ', tags: { qubit: ['transmon'] }, sources: { x: {} } };
    applySearchConfig(target, { presets: [] });
    expect(target.name).toBe('SCQ');
    expect(target.tags).toEqual({ qubit: ['transmon'] });
    // sources untouched because merged.sources was absent
    expect(target.sources).toEqual({ x: {} });
  });
});

describe('bootstrapSearchConfig', () => {
  beforeEach(() => {
    _reset();
    bus.clear();
    globalThis.SCRAPER_CONFIG = {
      sources: { stale: { label: 'stale' } },
      presets: [{ label: 'old', query: '' }],
      arxivCategories: ['stale'],
    };
  });
  afterEach(() => { delete globalThis.SCRAPER_CONFIG; });

  it('mutates SCRAPER_CONFIG with merged values once initConfig resolves', async () => {
    const map = buildMap({
      sources: [{ id: 'arxiv', label: 'arXiv', color: '#58a6ff', enabled: true, type: 'arxiv' }],
      presets: [{ label: 'qubit', query: 'qubit coherence' }],
      arxivCategories: ['quant-ph'],
    });
    await bootstrapSearchConfig([], {
      fetch: makeFetch(map),
      defaultsBase: '/defaults/',
      overridesBase: '/overrides/',
      schemaBase: '/schema/',
    });
    expect(globalThis.SCRAPER_CONFIG.sources).toEqual({
      arxiv: { label: 'arXiv', color: '#58a6ff', enabled: true, type: 'arxiv' },
    });
    expect(globalThis.SCRAPER_CONFIG.presets).toEqual([{ label: 'qubit', query: 'qubit coherence' }]);
    expect(globalThis.SCRAPER_CONFIG.arxivCategories).toEqual(['quant-ph']);
  });

  it('runs onReady callbacks after applying', async () => {
    const map = buildMap({ sources: [], presets: [], arxivCategories: [] });
    const calls = [];
    await bootstrapSearchConfig(
      [() => calls.push('a'), () => calls.push('b')],
      { fetch: makeFetch(map), defaultsBase: '/defaults/', overridesBase: '/overrides/', schemaBase: '/schema/' },
    );
    expect(calls).toEqual(['a', 'b']);
  });

  it('swallows initConfig failure and leaves SCRAPER_CONFIG untouched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = JSON.parse(JSON.stringify(globalThis.SCRAPER_CONFIG));
    const failingFetch = async () => { throw new Error('network down'); };
    await bootstrapSearchConfig([], {
      fetch: failingFetch, defaultsBase: '/defaults/', overridesBase: '/overrides/', schemaBase: '/schema/',
    });
    expect(globalThis.SCRAPER_CONFIG).toEqual(before);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('catches throwing onReady callbacks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = buildMap({ sources: [], presets: [], arxivCategories: [] });
    const calls = [];
    await bootstrapSearchConfig(
      [() => { throw new Error('boom'); }, () => calls.push('survived')],
      { fetch: makeFetch(map), defaultsBase: '/defaults/', overridesBase: '/overrides/', schemaBase: '/schema/' },
    );
    expect(calls).toEqual(['survived']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
