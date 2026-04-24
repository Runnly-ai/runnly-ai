import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryQueue } from '../inmemory-queue';

describe('InMemoryQueue', () => {
  let queue: InMemoryQueue;

  beforeEach(() => {
    queue = new InMemoryQueue();
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await expect(queue.connect()).resolves.toBeUndefined();
    });
  });

  describe('enqueue and dequeue', () => {
    it('should enqueue and dequeue a command', async () => {
      await queue.enqueue('cmd_1');
      const result = await queue.dequeue(1000);
      
      expect(result).toBe('cmd_1');
    });

    it('should dequeue in FIFO order', async () => {
      await queue.enqueue('cmd_1');
      await queue.enqueue('cmd_2');
      await queue.enqueue('cmd_3');

      expect(await queue.dequeue(1000)).toBe('cmd_1');
      expect(await queue.dequeue(1000)).toBe('cmd_2');
      expect(await queue.dequeue(1000)).toBe('cmd_3');
    });

    it('should return null on timeout when queue is empty', async () => {
      const result = await queue.dequeue(50);
      expect(result).toBeNull();
    });

    it('should handle direct handoff when dequeue is waiting', async () => {
      const dequeuePromise = queue.dequeue(5000);
      
      // Small delay to ensure dequeue starts waiting
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await queue.enqueue('cmd_1');
      
      const result = await dequeuePromise;
      expect(result).toBe('cmd_1');
    });

    it('should not enqueue when waiter is present', async () => {
      const dequeuePromise = queue.dequeue(5000);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await queue.enqueue('cmd_1');
      
      const result1 = await dequeuePromise;
      expect(result1).toBe('cmd_1');
      
      // Queue should be empty
      const result2 = await queue.dequeue(50);
      expect(result2).toBeNull();
    });

    it('should handle multiple concurrent dequeuers', async () => {
      const dequeue1 = queue.dequeue(5000);
      const dequeue2 = queue.dequeue(5000);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await queue.enqueue('cmd_1');
      await queue.enqueue('cmd_2');
      
      const results = await Promise.all([dequeue1, dequeue2]);
      expect(results).toContain('cmd_1');
      expect(results).toContain('cmd_2');
    });
  });

  describe('close', () => {
    it('should close successfully', async () => {
      await expect(queue.close()).resolves.toBeUndefined();
    });

    it('should release waiting dequeuers with null', async () => {
      const dequeue1 = queue.dequeue(10000);
      const dequeue2 = queue.dequeue(10000);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await queue.close();
      
      const results = await Promise.all([dequeue1, dequeue2]);
      expect(results).toEqual([null, null]);
    });

    it('should not affect already dequeued items', async () => {
      await queue.enqueue('cmd_1');
      await queue.close();
      
      const result = await queue.dequeue(100);
      expect(result).toBe('cmd_1');
    });
  });
});
