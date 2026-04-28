import { describe, it, expect, beforeEach } from 'vitest';
import { defineStore, _resetAll } from '../../core/store.js';

describe('store', () => {
  beforeEach(() => _resetAll());

  it('initializes state from the state() factory', () => {
    const useS = defineStore('s', { state: () => ({ n: 7 }) });
    const s = useS();
    expect(s.n).toBe(7);
    expect(s.$id).toBe('s');
    expect(s.$state).toEqual({ n: 7 });
  });

  it('returns the same instance for repeated useStore() calls', () => {
    const useS = defineStore('s', { state: () => ({ n: 0 }) });
    expect(useS()).toBe(useS());
  });

  it('getters recompute on state change', () => {
    const useS = defineStore('s', {
      state: () => ({ n: 2 }),
      getters: { double: (st) => st.n * 2 },
    });
    const s = useS();
    expect(s.double).toBe(4);
    s.$patch({ n: 5 });
    expect(s.double).toBe(10);
  });

  it('actions can mutate via $patch and notify subscribers once', () => {
    const useS = defineStore('s', {
      state: () => ({ n: 0 }),
      actions: { inc() { this.$patch({ n: this.n + 1 }); } },
    });
    const s = useS();
    let calls = 0;
    s.subscribe(() => calls++);
    s.inc();
    expect(s.n).toBe(1);
    expect(calls).toBe(1);
  });

  it('actions that mutate via property setters also notify', () => {
    const useS = defineStore('s', {
      state: () => ({ items: [] }),
      actions: { add(x) { this.items = [...this.items, x]; } },
    });
    const s = useS();
    let calls = 0;
    s.subscribe(() => calls++);
    s.add('a');
    s.add('b');
    expect(s.items).toEqual(['a', 'b']);
    expect(calls).toBe(2);
  });

  it('actions that touch no state do not notify', () => {
    const useS = defineStore('s', {
      state: () => ({ n: 0 }),
      actions: { noop() { return 'hi'; } },
    });
    const s = useS();
    let calls = 0;
    s.subscribe(() => calls++);
    expect(s.noop()).toBe('hi');
    expect(calls).toBe(0);
  });

  it('$reset() restores initial state and notifies', () => {
    const useS = defineStore('s', { state: () => ({ n: 0 }) });
    const s = useS();
    s.$patch({ n: 9 });
    let notified = false;
    s.subscribe(() => { notified = true; });
    s.$reset();
    expect(s.n).toBe(0);
    expect(notified).toBe(true);
  });

  it('$patch accepts a function that mutates state in place', () => {
    const useS = defineStore('s', { state: () => ({ list: [1, 2] }) });
    const s = useS();
    s.$patch((st) => st.list.push(3));
    expect(s.list).toEqual([1, 2, 3]);
  });

  it('subscribe returns an unsubscribe function', () => {
    const useS = defineStore('s', { state: () => ({ n: 0 }) });
    const s = useS();
    let calls = 0;
    const off = s.subscribe(() => calls++);
    s.$patch({ n: 1 });
    off();
    s.$patch({ n: 2 });
    expect(calls).toBe(1);
  });

  it('a throwing subscriber does not break siblings', () => {
    const useS = defineStore('s', { state: () => ({ n: 0 }) });
    const s = useS();
    const calls = [];
    s.subscribe(() => { throw new Error('x'); });
    s.subscribe(() => calls.push('ok'));
    expect(() => s.$patch({ n: 1 })).not.toThrow();
    expect(calls).toEqual(['ok']);
  });

  it('rejects bad inputs', () => {
    expect(() => defineStore(123, { state: () => ({}) })).toThrow();
    expect(() => defineStore('x', null)).toThrow();
    expect(() => defineStore('x', { state: 'not a fn' })).toThrow();
  });
});
