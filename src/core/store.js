/**
 * Tiny observable store with a Pinia-shaped API.
 *
 * Reason for the shape: when this app is eventually ported to Vue 3,
 * `defineStore` from Pinia has the same call signature, so consumers
 * (services, ui modules) shouldn't need to change — only the import.
 *
 * Differences from real Pinia (intentional, scope-limited):
 *  - No reactive proxies. Subscribers fire on explicit setState() and
 *    after action calls. Coarse but predictable.
 *  - No plugins, no SSR, no devtools.
 *  - Getters are computed lazily on access (no caching) — for this
 *    app's scale that's fine. Add memoization if a getter shows up
 *    in a profile.
 *
 * Usage:
 *   import { defineStore } from '../core/store.js';
 *
 *   const usePapers = defineStore('papers', {
 *     state: () => ({ list: [], loading: false }),
 *     getters: {
 *       count: state => state.list.length,
 *     },
 *     actions: {
 *       setList(list) { this.$patch({ list }); },
 *     },
 *   });
 *
 *   const papers = usePapers();
 *   papers.subscribe(state => render(state));
 *   papers.setList([...]);
 *   console.log(papers.count);
 *
 * No DOM. Safe to import in node.
 */

const _registry = new Map();

export function defineStore(id, options) {
  if (typeof id !== 'string') throw new TypeError('defineStore: id must be a string');
  if (!options || typeof options !== 'object') throw new TypeError('defineStore: options required');
  const { state: stateFn, getters = {}, actions = {} } = options;
  if (typeof stateFn !== 'function') throw new TypeError('defineStore: state must be a function');

  function useStore() {
    if (_registry.has(id)) return _registry.get(id);

    let _state = stateFn();
    const _subs = new Set();

    const store = {
      get $id() { return id; },
      get $state() { return _state; },

      $patch(partial) {
        if (typeof partial === 'function') partial(_state);
        else Object.assign(_state, partial);
        _notify();
      },

      $reset() {
        _state = stateFn();
        _notify();
      },

      subscribe(cb) {
        _subs.add(cb);
        return () => _subs.delete(cb);
      },
    };

    function _notify() {
      for (const cb of _subs) {
        try { cb(_state, store); }
        catch (e) { console.error(`[store:${id}] subscriber threw:`, e); }
      }
    }

    // State property forwarding — read direct, write via $patch.
    // This lets `store.list` work just like Pinia, but mutations should
    // go through actions or $patch so subscribers fire.
    for (const key of Object.keys(_state)) {
      Object.defineProperty(store, key, {
        get() { return _state[key]; },
        set(v) { _state[key] = v; _notify(); },
        enumerable: true,
      });
    }

    // Getters — exposed as read-only properties.
    for (const [name, fn] of Object.entries(getters)) {
      if (typeof fn !== 'function') continue;
      Object.defineProperty(store, name, {
        get() { return fn(_state, store); },
        enumerable: true,
      });
    }

    // Actions — bound with `this` referring to the store, so
    // `this.$patch(...)`, `this.someState`, `this.someAction()` all work.
    // Notification flows through $patch / property setters; the action
    // wrapper itself does NOT notify, otherwise actions that call $patch
    // would fire subscribers twice. If an action needs to mutate state
    // outside the public surface, call $patch.
    for (const [name, fn] of Object.entries(actions)) {
      if (typeof fn !== 'function') continue;
      store[name] = function (...args) {
        return fn.apply(store, args);
      };
    }

    _registry.set(id, store);
    return store;
  }

  useStore.$id = id;
  return useStore;
}

/** Test helper: forget a store so the next useStore() call rebuilds it. */
export function _resetStore(id) {
  _registry.delete(id);
}

/** Test helper: forget every store. */
export function _resetAll() {
  _registry.clear();
}
