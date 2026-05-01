/**
 * Regression tests for the export-import migration.
 *
 *   #2 (bug-audit 2026-04-30): _bytesToBinaryString must chunk so it does
 *      not throw RangeError on real-world DB files (>~65 KB worth of
 *      bytes). Pre-fix code used String.fromCharCode.apply(null, bytes),
 *      which blows the call stack past ~65,536 arguments.
 */

import { describe, it, expect } from 'vitest';
import { _bytesToBinaryString } from '../../../ui/database/export-import.js';

describe('_bytesToBinaryString (#2 chunked DB import)', () => {
  it('round-trips a small payload byte-for-byte', () => {
    const bytes = new Uint8Array([0, 65, 127, 128, 255]);
    const s = _bytesToBinaryString(bytes);
    expect(s.length).toBe(5);
    expect(s.charCodeAt(0)).toBe(0);
    expect(s.charCodeAt(1)).toBe(65);
    expect(s.charCodeAt(4)).toBe(255);
  });

  it('handles a 200,000-byte payload without stack overflow (regression for the apply() crash)', () => {
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    let s;
    expect(() => { s = _bytesToBinaryString(bytes); }).not.toThrow();
    expect(s.length).toBe(200_000);
    // Spot-check a few positions.
    expect(s.charCodeAt(0)).toBe(0);
    expect(s.charCodeAt(255)).toBe(255);
    expect(s.charCodeAt(256)).toBe(0);
    expect(s.charCodeAt(199_999)).toBe(199_999 & 0xff);
  });

  it('btoa(_bytesToBinaryString(bytes)) survives the round trip — the actual import contract', () => {
    const bytes = new Uint8Array(100_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
    const b64 = btoa(_bytesToBinaryString(bytes));
    // Decode back and compare.
    const decoded = atob(b64);
    expect(decoded.length).toBe(100_000);
    expect(decoded.charCodeAt(99_999)).toBe((99_999 * 7) & 0xff);
  });
});
