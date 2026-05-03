// @ts-check
/**
 * Tiny pub/sub bus. Use for cross-module messages that don't fit the store
 * (e.g. "config:search:changed", "paper:imported").
 *
 * Usage:
 *   import bus, { createBus } from '../core/events.js';
 *   bus.on('paper:imported', p => ...);
 *   bus.emit('paper:imported', { id: '2604.22086' });
 *   const local = createBus();   // scoped bus for one feature/test
 *
 * Pure ES module. No DOM. Safe to import in node (vitest).
 */

export function createBus() {
  const handlers = new Map();

  function on(event, cb) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(cb);
    return () => off(event, cb);
  }

  function off(event, cb) {
    const set = handlers.get(event);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) handlers.delete(event);
  }

  function emit(event, payload) {
    const set = handlers.get(event);
    if (!set) return;
    for (const cb of set) {
      try { cb(payload); }
      catch (e) { console.error(`[events] handler for "${event}" threw:`, e); }
    }
  }

  function once(event, cb) {
    const unsub = on(event, payload => { unsub(); cb(payload); });
    return unsub;
  }

  function clear(event) {
    if (event === undefined) handlers.clear();
    else handlers.delete(event);
  }

  return { on, off, emit, once, clear };
}

const bus = createBus();
export default bus;
export const { on, off, emit, once, clear } = bus;
