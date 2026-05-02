// @vitest-environment jsdom

/**
 * Tests for src/ui/settings/schema-form.js — the generic JSON-Schema → DOM
 * form renderer. Runs in jsdom; verifies DOM structure + onChange propagation
 * + structural edits (array add/remove).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderForm, defaultFor } from '../../../ui/settings/schema-form.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderForm: primitive types', () => {
  it('renders type:string as a text input', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    const form = renderForm(schema, { name: 'foo' }, () => {});
    document.body.appendChild(form);
    const input = form.querySelector('input[type="text"]');
    expect(input).toBeTruthy();
    expect(input.value).toBe('foo');
  });

  it('renders type:string + enum as a <select>', () => {
    const schema = {
      type: 'object',
      properties: { fmt: { type: 'string', enum: ['apa', 'mla', 'prl'] } },
    };
    const form = renderForm(schema, { fmt: 'mla' }, () => {});
    const select = form.querySelector('select');
    expect(select).toBeTruthy();
    expect(select.value).toBe('mla');
    expect(select.options.length).toBe(3);
  });

  it('renders type:string + format:email as <input type="email">', () => {
    const schema = {
      type: 'object',
      properties: { addr: { type: 'string', format: 'email' } },
    };
    const form = renderForm(schema, { addr: 'a@b.c' }, () => {});
    expect(form.querySelector('input[type="email"]')).toBeTruthy();
  });

  it('renders type:string + format:uri as <input type="url">', () => {
    const schema = {
      type: 'object',
      properties: { home: { type: 'string', format: 'uri' } },
    };
    const form = renderForm(schema, { home: 'https://x.com' }, () => {});
    expect(form.querySelector('input[type="url"]')).toBeTruthy();
  });

  it('renders type:integer with min/max attributes', () => {
    const schema = {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 10 } },
    };
    const form = renderForm(schema, { count: 5 }, () => {});
    const input = form.querySelector('input[type="number"]');
    expect(input.min).toBe('1');
    expect(input.max).toBe('10');
    expect(input.step).toBe('1');
  });

  it('renders type:boolean as a checkbox', () => {
    const schema = { type: 'object', properties: { on: { type: 'boolean' } } };
    const form = renderForm(schema, { on: true }, () => {});
    const cb = form.querySelector('input[type="checkbox"]');
    expect(cb).toBeTruthy();
    expect(cb.checked).toBe(true);
  });
});

describe('renderForm: onChange propagation', () => {
  it('emits new full value on string edit', () => {
    const onChange = vi.fn();
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    const form = renderForm(schema, { name: 'foo' }, onChange);
    const input = form.querySelector('input[type="text"]');
    input.value = 'bar';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith({ name: 'bar' });
  });

  it('emits new full value on checkbox toggle', () => {
    const onChange = vi.fn();
    const schema = { type: 'object', properties: { on: { type: 'boolean' } } };
    const form = renderForm(schema, { on: false }, onChange);
    const cb = form.querySelector('input[type="checkbox"]');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith({ on: true });
  });

  it('emits new full value on number edit (parsed as Number)', () => {
    const onChange = vi.fn();
    const schema = { type: 'object', properties: { n: { type: 'integer' } } };
    const form = renderForm(schema, { n: 1 }, onChange);
    const input = form.querySelector('input[type="number"]');
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith({ n: 42 });
  });

  it('preserves siblings when one nested field changes', () => {
    const onChange = vi.fn();
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'string' },
      },
    };
    const form = renderForm(schema, { a: 'A', b: 'B' }, onChange);
    const inputs = form.querySelectorAll('input[type="text"]');
    inputs[1].value = 'B-edited';
    inputs[1].dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith({ a: 'A', b: 'B-edited' });
  });
});

describe('renderForm: arrays', () => {
  it('renders an item per entry plus an Add button', () => {
    const schema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    };
    const form = renderForm(schema, { tags: ['x', 'y'] }, () => {});
    const items = form.querySelectorAll('.schema-array-item');
    expect(items.length).toBe(2);
    expect(form.querySelector('.schema-array-add')).toBeTruthy();
  });

  it('Add button appends a default-valued item', () => {
    const onChange = vi.fn();
    const schema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    };
    const form = renderForm(schema, { tags: ['a'] }, onChange);
    document.body.appendChild(form);
    form.querySelector('.schema-array-add').click();
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['a', ''] });
    // Partial redraw: item count is now 2
    expect(form.querySelectorAll('.schema-array-item').length).toBe(2);
  });

  it('Remove button drops the right index', () => {
    const onChange = vi.fn();
    const schema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    };
    const form = renderForm(schema, { tags: ['a', 'b', 'c'] }, onChange);
    document.body.appendChild(form);
    const removeBtns = form.querySelectorAll('.schema-array-remove');
    removeBtns[1].click();  // remove 'b'
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['a', 'c'] });
    expect(form.querySelectorAll('.schema-array-item').length).toBe(2);
  });

  it('handles array of objects', () => {
    const schema = {
      type: 'object',
      properties: {
        recipients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              active: { type: 'boolean' },
            },
          },
        },
      },
    };
    const form = renderForm(
      schema,
      { recipients: [{ email: 'a@b.c', active: true }] },
      () => {},
    );
    expect(form.querySelector('input[type="email"]').value).toBe('a@b.c');
    expect(form.querySelector('input[type="checkbox"]').checked).toBe(true);
  });
});

describe('defaultFor', () => {
  it('respects schema.default if present', () => {
    expect(defaultFor({ type: 'string', default: 'hi' })).toBe('hi');
    expect(defaultFor({ type: 'integer', default: 7 })).toBe(7);
  });

  it('returns sane defaults for primitive types', () => {
    expect(defaultFor({ type: 'string' })).toBe('');
    expect(defaultFor({ type: 'boolean' })).toBe(false);
    expect(defaultFor({ type: 'integer' })).toBe(0);
    expect(defaultFor({ type: 'number' })).toBe(0);
    expect(defaultFor({ type: 'array' })).toEqual([]);
  });

  it('returns the first enum value for enums', () => {
    expect(defaultFor({ type: 'string', enum: ['a', 'b'] })).toBe('a');
  });

  it('respects schema.minimum for numbers', () => {
    expect(defaultFor({ type: 'integer', minimum: 5 })).toBe(5);
  });

  it('returns nested defaults for objects', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'anon' },
        count: { type: 'integer' },
      },
    };
    expect(defaultFor(schema)).toEqual({ name: 'anon', count: 0 });
  });
});

describe('renderForm: $schema property', () => {
  it('skips the $schema metadata key', () => {
    const schema = {
      type: 'object',
      properties: {
        $schema: { type: 'string' },
        actual: { type: 'string' },
      },
    };
    const form = renderForm(schema, { $schema: 'meta', actual: 'real' }, () => {});
    // Only one rendered input — for "actual"
    expect(form.querySelectorAll('input[type="text"]').length).toBe(1);
  });
});

describe('renderForm: descriptions and required marker', () => {
  it('renders schema.description as help text', () => {
    const schema = {
      type: 'object',
      properties: {
        x: { type: 'string', description: 'this is help' },
      },
    };
    const form = renderForm(schema, { x: '' }, () => {});
    const help = form.querySelector('.schema-help');
    expect(help).toBeTruthy();
    expect(help.textContent).toBe('this is help');
  });

  it('appends a star marker for required fields', () => {
    const schema = {
      type: 'object',
      required: ['x'],
      properties: { x: { type: 'string' } },
    };
    const form = renderForm(schema, { x: '' }, () => {});
    const lbl = form.querySelector('.schema-label');
    expect(lbl.textContent).toMatch(/\*$/);
  });
});
