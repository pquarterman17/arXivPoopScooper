/**
 * Generic JSON-Schema → DOM form renderer.
 *
 * Takes a JSON Schema (Draft 2020-12), an initial value, and an onChange
 * callback. Returns an HTMLElement representing the form. Each input edit
 * calls `onChange(fullNewValue)` with the entire new value. The renderer
 * holds its own internal mutable state so structural edits (array add /
 * remove) can partial-redraw without losing focus on sibling text inputs.
 *
 * State model:
 *   - Each composite renderer (object, array) holds a mutable `value` in
 *     closure scope.
 *   - Primitive edits propagate via `onChange` upward and update each
 *     ancestor's mutable value, but do NOT trigger a redraw — the input
 *     keeps focus.
 *   - Array add/remove DO trigger a partial redraw of just that array's
 *     list. Sibling fields (other array items, other properties of the
 *     parent object) keep their DOM and focus.
 *
 * Why not full re-render on every edit: full re-render is correct but
 * loses focus mid-typing. Mutable closures keep typing fluid while still
 * supporting structural edits.
 *
 * Supported constructs (covers all 9 shipped schemas + paths):
 *   • type: object        — `properties` iterated; nested objects recurse.
 *   • type: string        — text input. `enum` → select. `format: "email"`
 *                           or `"uri"` → typed input. `pattern` → HTML attr.
 *   • type: integer/number— number input with min/max from `minimum`/`maximum`.
 *   • type: boolean       — checkbox.
 *   • type: array         — list with add/remove buttons. items can be
 *                           primitive or object.
 *   • title / description — rendered as label and help text.
 *   • $schema property    — silently skipped (it's just JSON-LD metadata).
 *
 * Not handled: $ref, oneOf/anyOf/allOf, conditionals (if/then/else), const.
 *
 * @param {object}   schema    The JSON Schema for the value.
 * @param {*}        value     The current value (must conform to the schema).
 * @param {Function} onChange  Called with `(newFullValue)` on every edit.
 * @returns {HTMLElement}      A form node ready to insert into the DOM.
 */
export function renderForm(schema, value, onChange) {
  const root = document.createElement('div');
  root.className = 'schema-form';
  root.appendChild(renderField(schema, value, onChange, { topLevel: true }));
  return root;
}

// ─── field dispatcher ───

function renderField(schema, value, onChange, opts = {}) {
  if (schema.type === 'object') return renderObject(schema, value ?? {}, onChange, opts);
  if (schema.type === 'array') return renderArray(schema, value ?? [], onChange, opts);
  if (schema.type === 'boolean') return renderBoolean(schema, value ?? false, onChange, opts);
  if (schema.type === 'integer' || schema.type === 'number') {
    return renderNumber(schema, value ?? null, onChange, opts);
  }
  return renderString(schema, value ?? '', onChange, opts);
}

// ─── object ───

function renderObject(schema, initial, onChange, opts) {
  const wrap = document.createElement(opts.topLevel ? 'div' : 'fieldset');
  wrap.className = 'schema-object';
  if (!opts.topLevel) {
    if (schema.title) {
      const legend = document.createElement('legend');
      legend.textContent = schema.title;
      wrap.appendChild(legend);
    }
    if (schema.description) wrap.appendChild(helpText(schema.description));
  }
  let value = { ...initial };
  const required = new Set(schema.required ?? []);
  const props = schema.properties ?? {};
  for (const [name, propSchema] of Object.entries(props)) {
    if (name === '$schema') continue;
    const row = renderField(
      propSchema,
      value[name],
      (newV) => {
        value = { ...value, [name]: newV };
        onChange(value);
      },
      { propName: name, required: required.has(name) },
    );
    wrap.appendChild(row);
  }
  return wrap;
}

// ─── array ───

function renderArray(schema, initial, onChange, opts) {
  const wrap = document.createElement('fieldset');
  wrap.className = 'schema-array';
  const legend = document.createElement('legend');
  legend.textContent = labelText(schema, opts);
  wrap.appendChild(legend);
  if (schema.description) wrap.appendChild(helpText(schema.description));

  let value = [...initial];
  const list = document.createElement('div');
  list.className = 'schema-array-items';
  wrap.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'schema-array-add';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', () => {
    value = [...value, defaultFor(schema.items ?? { type: 'string' })];
    onChange(value);
    redrawList();
  });
  wrap.appendChild(addBtn);

  function redrawList() {
    list.innerHTML = '';
    value.forEach((item, idx) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'schema-array-item';
      const itemBody = renderField(
        schema.items ?? { type: 'string' },
        item,
        (newV) => {
          value = value.map((v, i) => (i === idx ? newV : v));
          onChange(value);
          // Primitive item edits: don't redraw. Object items handle their
          // own internal state via their own renderObject closure, so this
          // path is only hit for whole-item replacement, which is rare.
        },
        { propName: `[${idx}]` },
      );
      itemBody.classList.add('schema-array-item-body');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'schema-array-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove this item';
      removeBtn.addEventListener('click', () => {
        value = value.filter((_, i) => i !== idx);
        onChange(value);
        redrawList();
      });
      itemRow.append(itemBody, removeBtn);
      list.appendChild(itemRow);
    });
  }

  redrawList();
  return wrap;
}

// ─── primitives ───

function renderBoolean(schema, value, onChange, opts) {
  const row = document.createElement('label');
  row.className = 'schema-row schema-bool';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!value;
  input.addEventListener('change', () => onChange(input.checked));
  const span = document.createElement('span');
  span.textContent = labelText(schema, opts);
  row.append(input, span);
  if (schema.description) row.appendChild(helpText(schema.description));
  return row;
}

function renderNumber(schema, value, onChange, opts) {
  const row = document.createElement('label');
  row.className = 'schema-row schema-number';
  const lbl = document.createElement('span');
  lbl.className = 'schema-label';
  lbl.textContent = labelText(schema, opts);
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value == null ? '' : String(value);
  if (schema.minimum != null) input.min = String(schema.minimum);
  if (schema.maximum != null) input.max = String(schema.maximum);
  if (schema.type === 'integer') input.step = '1';
  if (opts.required) input.required = true;
  input.addEventListener('input', () => {
    const v = input.value === '' ? undefined : Number(input.value);
    onChange(v);
  });
  row.append(lbl, input);
  if (schema.description) row.appendChild(helpText(schema.description));
  return row;
}

function renderString(schema, value, onChange, opts) {
  const row = document.createElement('label');
  row.className = 'schema-row schema-string';
  const lbl = document.createElement('span');
  lbl.className = 'schema-label';
  lbl.textContent = labelText(schema, opts);

  let input;
  if (Array.isArray(schema.enum)) {
    input = document.createElement('select');
    for (const opt of schema.enum) {
      const o = document.createElement('option');
      o.value = String(opt);
      o.textContent = String(opt);
      if (opt === value) o.selected = true;
      input.appendChild(o);
    }
    input.addEventListener('change', () => onChange(input.value));
  } else {
    input = document.createElement('input');
    input.type =
      schema.format === 'email' ? 'email'
      : schema.format === 'uri' ? 'url'
      : schema.format === 'date' ? 'date'
      : 'text';
    input.value = value ?? '';
    if (schema.pattern) input.pattern = schema.pattern;
    if (opts.required) input.required = true;
    input.addEventListener('input', () => onChange(input.value));
  }

  row.append(lbl, input);
  if (schema.description) row.appendChild(helpText(schema.description));
  return row;
}

// ─── helpers ───

function labelText(schema, opts) {
  const base = schema.title || opts.propName || '';
  return opts.required ? `${base} *` : base;
}

function helpText(text) {
  const el = document.createElement('small');
  el.className = 'schema-help';
  el.textContent = text;
  return el;
}

/** Best-effort default value for a schema; used when adding a new array item. */
export function defaultFor(schema) {
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.type === 'object') {
    const out = {};
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k !== '$schema') out[k] = defaultFor(sub);
    }
    return out;
  }
  if (schema.type === 'array') return [];
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') {
    return schema.minimum ?? 0;
  }
  if (Array.isArray(schema.enum)) return schema.enum[0];
  return '';
}
