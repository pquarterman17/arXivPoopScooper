import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDB, seedPaper, db } from './_helpers.js';
import * as rs from '../../services/read-status.js';

describe('services/read-status', () => {
  beforeEach(freshDB);
  afterEach(() => db._reset());

  it('ensure() makes a row exist without overwriting an existing one', () => {
    seedPaper({ id: '1' });  // already inserts read_status default row
    rs.setPriority('1', 2);
    rs.ensure('1');  // must not reset priority
    expect(rs.get('1')).toEqual({ is_read: 0, priority: 2 });
  });

  it('setRead preserves priority', () => {
    seedPaper({ id: '1' });
    rs.setPriority('1', 3);
    rs.setRead('1', true);
    expect(rs.get('1')).toEqual({ is_read: 1, priority: 3 });
    rs.setRead('1', false);
    expect(rs.get('1')).toEqual({ is_read: 0, priority: 3 });
  });

  it('setPriority preserves read flag', () => {
    seedPaper({ id: '1' });
    rs.setRead('1', true);
    rs.setPriority('1', 2);
    expect(rs.get('1')).toEqual({ is_read: 1, priority: 2 });
  });

  it('setPriority validates the range', () => {
    seedPaper({ id: '1' });
    expect(() => rs.setPriority('1', -1)).toThrow();
    expect(() => rs.setPriority('1', 4)).toThrow();
    expect(() => rs.setPriority('1', '2')).toThrow();
  });

  it('counts() reports total / read / unread', () => {
    seedPaper({ id: '1' });
    seedPaper({ id: '2' });
    seedPaper({ id: '3' });
    rs.setRead('1', true);
    rs.setRead('2', true);
    expect(rs.counts()).toEqual({ total: 3, read: 2, unread: 1 });
  });

  it('highPriorityPapers filters by minimum priority and orders by priority desc', () => {
    seedPaper({ id: '1', title: 'A', date_added: '2024-01-01' });
    seedPaper({ id: '2', title: 'B', date_added: '2024-02-01' });
    seedPaper({ id: '3', title: 'C', date_added: '2024-03-01' });
    rs.setPriority('1', 1);
    rs.setPriority('2', 3);
    rs.setPriority('3', 2);
    const list = rs.highPriorityPapers(1);
    expect(list.map((p) => p.paper_id)).toEqual(['2', '3', '1']);
    expect(rs.highPriorityPapers(3).map((p) => p.paper_id)).toEqual(['2']);
    expect(rs.highPriorityPapers(4)).toEqual([]);
  });
});
