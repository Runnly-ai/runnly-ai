import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createId } from '../id';

describe('createId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should generate id with given prefix', () => {
    const timestamp = new Date('2024-01-01').getTime();
    vi.setSystemTime(timestamp);

    const id = createId('test');
    expect(id).toMatch(/^test_\d+_[a-z0-9]{8}$/);
    expect(id).toContain(`test_${timestamp}_`);
  });

  it('should generate unique ids for same prefix', () => {
    const id1 = createId('sess');
    const id2 = createId('sess');
    
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^sess_/);
    expect(id2).toMatch(/^sess_/);
  });

  it('should work with different prefixes', () => {
    const prefixes = ['task', 'cmd', 'evt', 'proj'];
    
    prefixes.forEach(prefix => {
      const id = createId(prefix);
      expect(id).toMatch(new RegExp(`^${prefix}_\\d+_[a-z0-9]{8}$`));
    });
  });

  it('should include timestamp in id', () => {
    const timestamp = 1704067200000; // 2024-01-01
    vi.setSystemTime(timestamp);
    
    const id = createId('test');
    expect(id).toContain(timestamp.toString());
  });
});
