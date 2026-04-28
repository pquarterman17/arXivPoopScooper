/**
 * Config loader: defaults  ←overridden by→  user_config/*
 *
 * For each domain (digest, citations, ui, ...) the loader:
 *   1. fetches src/config/defaults/<domain>.json
 *   2. fetches data/user_config/<domain>.json    (404 = no override, that's fine)
 *   3. fetches src/config/schema/<domain>.schema.json
 *   4. deep-merges the override on top of the defaults
 *   5. validates the merged result against the schema
 *   6. returns { data, source, errors }
 *
 * Validation uses a minimal in-house JSON Schema checker — it covers exactly
 * the Draft 2020-12 features used by our schemas (type, properties, required,
 * enum, pattern, min/max, items, uniqueItems, additionalProperties, format=email,
 * anyOf, const). If we ever need $ref, oneOf, allOf, etc., swap for ajv at the
 * loader boundary.
 *
 * Pure ES module, no DOM. Safe to import in node.
 */

export const MANIFEST = [
  'digest',
  'citations',
  'ui',
  'ingest',
  'email',
  'watchlist',
  'privacy',
  'search-sources',
  'auto-tag-rules',
];

const DEFAULT_DEFAULTS_BASE = '/src/config/defaults/';
const DEFAULT_OVERRIDES_BASE = '/data/user_config/';
const DEFAULT_SCHEMA_BASE = '/src/config/schema/';

/**
 * Load and validate one config domain.
 *
 * @param {string} domain  — one of MANIFEST
 * @param {object} [opts]
 * @param {function} [opts.fetch]          — fetch impl (default: globalThis.fetch)
 * @param {string}   [opts.defaultsBase]   — URL prefix for defaults files
 * @param {string}   [opts.overridesBase]  — URL prefix for user_config files
 * @param {string}   [opts.schemaBase]     — URL prefix for schema files
 * @returns {Promise<{ data: object, source: 'defaults'|'merged', errors: string[] }>}
 */
export async function loadConfig(domain, opts = {}) {
  if (!MANIFEST.includes(domain)) {
    throw new Error(`[config/loader] unknown domain "${domain}". Known: ${MANIFEST.join(', ')}`);
  }
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) throw new Error('[config/loader] no fetch available');
  const defaultsUrl = (opts.defaultsBase ?? DEFAULT_DEFAULTS_BASE) + domain + '.json';
  const overrideUrl = (opts.overridesBase ?? DEFAULT_OVERRIDES_BASE) + domain + '.json';
  const schemaUrl = (opts.schemaBase ?? DEFAULT_SCHEMA_BASE) + domain + '.schema.json';

  const defaults = await _fetchJson(fetchFn, defaultsUrl, { required: true });
  const override = await _fetchJson(fetchFn, overrideUrl, { required: false });
  const schema = await _fetchJson(fetchFn, schemaUrl, { required: true });

  const merged = override ? schemaAwareMerge(defaults, override, schema) : { ...defaults };
  // strip the meta $schema key before validation — it's an editor hint, not config
  const cleaned = stripSchemaKey(merged);
  const errors = validate(cleaned, schema, '$');

  return {
    data: cleaned,
    source: override ? 'merged' : 'defaults',
    errors,
  };
}

/** Load every domain in parallel. Returns a map { domain: { data, source, errors } }. */
export async function loadAll(opts = {}) {
  const entries = await Promise.all(
    MANIFEST.map(async (d) => [d, await loadConfig(d, opts)]),
  );
  return Object.fromEntries(entries);
}

// ─── Deep merge ───

/**
 * Recursive merge. Plain objects are merged key-by-key; arrays and scalars
 * in `b` replace whatever was in `a`. Returns a new object — `a` and `b`
 * are not mutated.
 */
export function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Schema-aware merge. Like deepMerge, but for arrays whose items schema
 * carries `x-mergeKey: "<field>"`, merges entries by that key instead of
 * replacing the array. This lets users override one source by id without
 * having to copy the full sources list.
 *
 * Falls back to deepMerge behavior when no schema is provided.
 */
export function schemaAwareMerge(a, b, schema) {
  if (!schema || !isPlainObject(schema)) return deepMerge(a, b);

  // Object: recurse property-by-property
  if (isPlainObject(a) && isPlainObject(b)) {
    const props = isPlainObject(schema.properties) ? schema.properties : {};
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      const subSchema = props[k];
      out[k] = subSchema ? schemaAwareMerge(out[k], v, subSchema) : (
        isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v
      );
    }
    return out;
  }

  // Array with x-mergeKey: id-merge
  if (Array.isArray(a) && Array.isArray(b)
      && isPlainObject(schema.items)
      && typeof schema['x-mergeKey'] === 'string') {
    const key = schema['x-mergeKey'];
    const aById = new Map();
    const order = [];
    for (const item of a) {
      if (isPlainObject(item) && key in item) {
        aById.set(item[key], item);
        order.push(item[key]);
      }
    }
    for (const item of b) {
      if (!isPlainObject(item) || !(key in item)) continue;
      if (aById.has(item[key])) {
        aById.set(item[key], schemaAwareMerge(aById.get(item[key]), item, schema.items));
      } else {
        aById.set(item[key], item);
        order.push(item[key]);
      }
    }
    return order.map((k) => aById.get(k));
  }

  // Anything else: b replaces a (or stays a if b is undefined)
  return b === undefined ? a : b;
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function stripSchemaKey(obj) {
  if (!isPlainObject(obj)) return obj;
  const { $schema, ...rest } = obj;
  return rest;
}

// ─── Minimal JSON Schema validator (Draft 2020-12 subset) ───

/**
 * Validates `value` against `schema`. Returns an array of error strings
 * (empty array = valid). Each error reads "$.path.to.field: <reason>".
 *
 * Implemented keywords:
 *   type, enum, const,
 *   properties, additionalProperties, required,
 *   items, uniqueItems,
 *   minimum, maximum, minLength, maxLength,
 *   pattern, format (email only),
 *   anyOf
 */
export function validate(value, schema, path = '$') {
  const errors = [];
  _check(value, schema, path, errors);
  return errors;
}

function _check(value, schema, path, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${path}: schema disallows any value`);
    return;
  }
  if (!isPlainObject(schema)) return;

  if (Array.isArray(schema.type)) {
    if (!schema.type.some((t) => _typeMatches(value, t))) {
      errors.push(`${path}: expected one of [${schema.type.join(', ')}], got ${_typeOf(value)}`);
    }
  } else if (typeof schema.type === 'string') {
    if (!_typeMatches(value, schema.type)) {
      errors.push(`${path}: expected ${schema.type}, got ${_typeOf(value)}`);
    }
  }

  if ('const' in schema && !_deepEq(value, schema.const)) {
    errors.push(`${path}: must equal const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => _deepEq(value, v))) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${path}: minLength ${schema.minLength}, got ${value.length}`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${path}: maxLength ${schema.maxLength}, got ${value.length}`);
    }
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          errors.push(`${path}: does not match pattern ${schema.pattern}`);
        }
      } catch (_) { /* invalid pattern in schema — ignore */ }
    }
    if (schema.format === 'email' && !_isEmail(value)) {
      errors.push(`${path}: not a valid email address`);
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path}: minimum ${schema.minimum}, got ${value}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path}: maximum ${schema.maximum}, got ${value}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.items) {
      value.forEach((v, i) => _check(v, schema.items, `${path}[${i}]`, errors));
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (let i = 0; i < value.length; i++) {
        const k = JSON.stringify(value[i]);
        if (seen.has(k)) {
          errors.push(`${path}[${i}]: duplicate item`);
          break;
        }
        seen.add(k);
      }
    }
  }

  if (isPlainObject(value) && schema.type === 'object' || isPlainObject(value) && isPlainObject(schema.properties)) {
    const props = schema.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) _check(value[key], sub, `${path}.${key}`, errors);
    }
    if (Array.isArray(schema.required)) {
      for (const r of schema.required) {
        if (!(r in value)) errors.push(`${path}.${r}: required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push(`${path}.${key}: unknown property`);
      }
    } else if (isPlainObject(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) _check(value[key], schema.additionalProperties, `${path}.${key}`, errors);
      }
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const branchErrors = schema.anyOf.map((b) => validate(value, b, path));
    if (!branchErrors.some((e) => e.length === 0)) {
      errors.push(`${path}: did not match any anyOf branch (${branchErrors.flat().join('; ')})`);
    }
  }
}

function _typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function _typeMatches(v, expected) {
  switch (expected) {
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'number': return typeof v === 'number';
    case 'object': return isPlainObject(v);
    case 'string': return typeof v === 'string';
    case 'boolean': return typeof v === 'boolean';
    default: return false;
  }
}

function _deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => _deepEq(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a); const bk = Object.keys(b);
    return ak.length === bk.length && ak.every((k) => _deepEq(a[k], b[k]));
  }
  return false;
}

function _isEmail(s) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s);
}

// ─── internals ───

async function _fetchJson(fetchFn, url, { required }) {
  const resp = await fetchFn(url);
  if (!resp.ok) {
    if (required) {
      throw new Error(`[config/loader] failed to fetch ${url} (HTTP ${resp.status})`);
    }
    return null;
  }
  try {
    return await resp.json();
  } catch (e) {
    throw new Error(`[config/loader] ${url} is not valid JSON: ${e.message}`);
  }
}
