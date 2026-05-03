// @ts-check
/**
 * Runtime config API — the read side of the configuration system.
 *
 * Pattern: bootstrap once with `initConfig()` (async), then call `getConfig(domain)`
 * synchronously from anywhere. `subscribe()` lets a feature react to config changes
 * (typically from the Settings UI calling `reload()`).
 *
 * All cross-module config changes also flow through the events bus as
 * `config:<domain>:changed` so non-React code can listen without touching this
 * module.
 *
 * No DOM. Safe to import in node.
 */

import bus from './events.js';
import { loadConfig, loadAll, MANIFEST } from '../config/loader.js';

const _cache = new Map();    // domain → resolved config object
const _errors = new Map();   // domain → array of validation error strings
const _subs = new Map();     // domain → Set<callback>
let _initialized = false;
let _loaderOpts = {};

/**
 * Bootstrap. Loads every domain in MANIFEST in parallel and caches the results.
 * Call this once near app startup, before any synchronous getConfig() call.
 *
 * @param {object} [opts] forwarded to loader.loadConfig
 */
export async function initConfig(opts = {}) {
  _loaderOpts = opts;
  const all = await loadAll(opts);
  for (const [domain, result] of Object.entries(all)) {
    _cache.set(domain, result.data);
    _errors.set(domain, result.errors);
    if (result.errors.length > 0) {
      console.warn(
        `[config] ${domain} loaded with ${result.errors.length} validation error(s):`,
        result.errors,
      );
    }
  }
  _initialized = true;
  bus.emit('config:initialized', { domains: [...MANIFEST] });
  return all;
}

/**
 * Return the resolved config for a domain. Synchronous — requires initConfig() first.
 */
export function getConfig(domain) {
  if (!_cache.has(domain)) {
    if (!_initialized) {
      throw new Error(`[config] getConfig('${domain}') before initConfig() — call initConfig() at app startup`);
    }
    throw new Error(`[config] unknown domain '${domain}'. Known: ${MANIFEST.join(', ')}`);
  }
  return _cache.get(domain);
}

/** Return validation errors observed at last load for a domain (empty array = clean). */
export function getErrors(domain) {
  return _errors.get(domain) ?? [];
}

/**
 * Re-fetch a domain from disk and re-validate. Notifies subscribers and emits
 * `config:<domain>:changed` if the resolved value changed.
 */
export async function reload(domain) {
  const result = await loadConfig(domain, _loaderOpts);
  const prev = _cache.get(domain);
  _cache.set(domain, result.data);
  _errors.set(domain, result.errors);
  const changed = JSON.stringify(prev) !== JSON.stringify(result.data);
  if (changed) {
    _notify(domain, result.data, prev);
    bus.emit(`config:${domain}:changed`, { current: result.data, previous: prev });
  }
  return result;
}

/**
 * Subscribe to changes for a domain. Returns an unsubscribe function.
 * The callback receives (currentConfig, previousConfig).
 */
export function subscribe(domain, cb) {
  if (!_subs.has(domain)) _subs.set(domain, new Set());
  _subs.get(domain).add(cb);
  return () => {
    const set = _subs.get(domain);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) _subs.delete(domain);
  };
}

/** Test helper. Reset all internal state. */
export function _reset() {
  _cache.clear();
  _errors.clear();
  _subs.clear();
  _initialized = false;
  _loaderOpts = {};
}

function _notify(domain, current, previous) {
  const set = _subs.get(domain);
  if (!set) return;
  for (const cb of set) {
    try { cb(current, previous); }
    catch (e) { console.error(`[config:${domain}] subscriber threw:`, e); }
  }
}
