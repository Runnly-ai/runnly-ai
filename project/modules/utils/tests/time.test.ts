import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nowTs } from '../time';

describe('nowTs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should return current timestamp', () => {
    const expectedTime = new Date('2024-01-01T12:00:00Z').getTime();
    vi.setSystemTime(expectedTime);
    
    const result = nowTs();
    expect(result).toBe(expectedTime);
  });

  it('should return different timestamps when time changes', () => {
    const time1 = new Date('2024-01-01T12:00:00Z').getTime();
    vi.setSystemTime(time1);
    const ts1 = nowTs();
    
    const time2 = new Date('2024-01-01T13:00:00Z').getTime();
    vi.setSystemTime(time2);
    const ts2 = nowTs();
    
    expect(ts1).not.toBe(ts2);
    expect(ts2).toBeGreaterThan(ts1);
  });

  it('should return a positive number', () => {
    vi.useRealTimers();
    const result = nowTs();
    expect(result).toBeGreaterThan(0);
    expect(typeof result).toBe('number');
  });
});
