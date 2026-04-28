/**
 * Search orchestrator. Bridges the search-sources config with the protocol
 * handlers (services/arxiv.js, eventually services/crossref.js).
 *
 * Given (query, sourceIds, opts), look up each source's config, dispatch to
 * the right handler based on `type`, aggregate the results. This is the only
 * place that knows about the source-types→handlers mapping.
 *
 * No DOM. Safe to import in node.
 */

import { searchArxiv, sortPapers } from './arxiv.js';

/**
 * Run a search across one or more sources.
 *
 * @param {string}   query        — free-text query
 * @param {object}   opts
 * @param {string[]} [opts.sourceIds]   — source ids from search-sources.sources
 * @param {object[]} [opts.sources]     — full source objects (skip the lookup)
 * @param {object}   [opts.searchConfig] — the resolved search-sources config
 * @param {string}   [opts.sort]
 * @param {number}   [opts.maxResults]
 * @param {function} opts.fetch         — fetch impl (passed through to handlers)
 * @param {function} opts.parseXml      — DOMParser-shaped parser
 * @param {function} [opts.crossrefFetch] — handler for type='crossref'; thrown if unset
 * @returns {Promise<{ papers: object[], errors: { sourceId, message }[] }>}
 */
export async function searchSources(query, opts = {}) {
  if (!query || !query.trim()) return { papers: [], errors: [] };
  const { sources, sort, maxResults, fetch, parseXml, crossrefFetch } = opts;
  const list = sources ?? _resolveSources(opts);
  if (list.length === 0) return { papers: [], errors: [] };

  const errors = [];
  const buckets = await Promise.all(list.map(async (src) => {
    try {
      switch (src.type) {
        case 'arxiv':
          return await searchArxiv(query, {
            fetch, parseXml, sort, maxResults,
            sourceLabel: src.id,
          });
        case 'arxiv-jr':
          if (!src.journalRef) {
            throw new Error(`source "${src.id}" is type arxiv-jr but has no journalRef`);
          }
          return await searchArxiv(query, {
            fetch, parseXml, sort, maxResults,
            journalRef: src.journalRef,
            sourceLabel: src.id,
          });
        case 'crossref':
          if (typeof crossrefFetch !== 'function') {
            throw new Error('crossref dispatch requires opts.crossrefFetch (services/crossref.js)');
          }
          return await crossrefFetch(query, src, { fetch, sort, maxResults });
        default:
          throw new Error(`unknown source type "${src.type}"`);
      }
    } catch (e) {
      errors.push({ sourceId: src.id, message: e.message });
      return [];
    }
  }));

  const merged = buckets.flat();
  // Dedupe by id — the same arxiv ID can show up from arxiv + arxiv-jr filters
  const seen = new Set();
  const unique = [];
  for (const p of merged) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    unique.push(p);
  }
  return { papers: sortPapers(unique, sort), errors };
}

/**
 * Convenience: filter the configured `sources` array by id list, defaulting
 * to all enabled sources when sourceIds is empty/undefined.
 */
export function pickSources(searchConfig, sourceIds) {
  if (!searchConfig || !Array.isArray(searchConfig.sources)) return [];
  const all = searchConfig.sources;
  if (Array.isArray(sourceIds) && sourceIds.length > 0) {
    const wanted = new Set(sourceIds);
    return all.filter((s) => wanted.has(s.id));
  }
  return all.filter((s) => s.enabled !== false);
}

/** Find a preset by id. Returns null if missing. */
export function getPreset(searchConfig, presetId) {
  if (!searchConfig || !Array.isArray(searchConfig.presets)) return null;
  return searchConfig.presets.find((p) => p.id === presetId) ?? null;
}

// ─── internals ───

function _resolveSources(opts) {
  if (!opts.searchConfig) return [];
  return pickSources(opts.searchConfig, opts.sourceIds);
}
