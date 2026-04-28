import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, db } from './_helpers.js';
import * as settings from '../../services/settings.js';

describe('services/settings', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  it('round-trips strings, numbers, booleans, arrays, objects', () => {
    settings.set('s', 'hi');
    settings.set('n', 42);
    settings.set('b', true);
    settings.set('a', [1, 2, 3]);
    settings.set('o', { a: 1, b: ['x'] });
    expect(settings.get('s')).toBe('hi');
    expect(settings.get('n')).toBe(42);
    expect(settings.get('b')).toBe(true);
    expect(settings.get('a')).toEqual([1, 2, 3]);
    expect(settings.get('o')).toEqual({ a: 1, b: ['x'] });
  });

  it('get returns the fallback for missing keys', () => {
    expect(settings.get('missing')).toBeNull();
    expect(settings.get('missing', 'default')).toBe('default');
  });

  it('set with empty key throws', () => {
    expect(() => settings.set('', 'x')).toThrow();
    expect(() => settings.set(null, 'x')).toThrow();
  });

  it('set replaces an existing value', () => {
    settings.set('k', 'a');
    settings.set('k', 'b');
    expect(settings.get('k')).toBe('b');
  });

  it('remove deletes a key', () => {
    settings.set('k', 'v');
    settings.remove('k');
    expect(settings.get('k', 'def')).toBe('def');
  });

  it('getAll returns every parsed entry', () => {
    settings.set('a', 1);
    settings.set('b', 'two');
    expect(settings.getAll()).toEqual({ a: 1, b: 'two' });
  });

  it('getAll skips entries with corrupt JSON', () => {
    db.run("INSERT INTO settings (key, value) VALUES ('good', '\"hi\"')");
    db.run("INSERT INTO settings (key, value) VALUES ('bad', 'not json')");
    expect(settings.getAll()).toEqual({ good: 'hi' });
  });

  it('getNamespace strips the prefix', () => {
    settings.set('ui.theme', 'dark');
    settings.set('ui.tab', 'library');
    settings.set('other.x', 1);
    expect(settings.getNamespace('ui')).toEqual({ theme: 'dark', tab: 'library' });
    expect(settings.getNamespace('ui.')).toEqual({ theme: 'dark', tab: 'library' });
    expect(settings.getNamespace('missing')).toEqual({});
  });
});
