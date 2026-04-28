import { describe, it, expect, beforeEach } from 'vitest';
import bus, { createBus } from '../../core/events.js';

describe('events bus', () => {
  beforeEach(() => bus.clear());

  it('emit calls registered handlers with payload', () => {
    const calls = [];
    bus.on('hello', (p) => calls.push(p));
    bus.emit('hello', { x: 1 });
    bus.emit('hello', { x: 2 });
    expect(calls).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('on() returns an unsubscribe function', () => {
    const calls = [];
    const off = bus.on('e', () => calls.push(1));
    bus.emit('e');
    off();
    bus.emit('e');
    expect(calls.length).toBe(1);
  });

  it('off() removes a specific handler', () => {
    const calls = [];
    const a = () => calls.push('a');
    const b = () => calls.push('b');
    bus.on('e', a);
    bus.on('e', b);
    bus.off('e', a);
    bus.emit('e');
    expect(calls).toEqual(['b']);
  });

  it('once() fires exactly one time', () => {
    let n = 0;
    bus.once('e', () => n++);
    bus.emit('e');
    bus.emit('e');
    bus.emit('e');
    expect(n).toBe(1);
  });

  it('a throwing handler does not break sibling handlers', () => {
    const calls = [];
    bus.on('e', () => { throw new Error('boom'); });
    bus.on('e', () => calls.push('ok'));
    expect(() => bus.emit('e')).not.toThrow();
    expect(calls).toEqual(['ok']);
  });

  it('createBus() returns an isolated bus', () => {
    const a = createBus();
    const b = createBus();
    let aHits = 0; let bHits = 0;
    a.on('e', () => aHits++);
    b.on('e', () => bHits++);
    a.emit('e');
    expect(aHits).toBe(1);
    expect(bHits).toBe(0);
  });

  it('clear() with an event name removes only that event', () => {
    const calls = [];
    bus.on('a', () => calls.push('a'));
    bus.on('b', () => calls.push('b'));
    bus.clear('a');
    bus.emit('a');
    bus.emit('b');
    expect(calls).toEqual(['b']);
  });
});
