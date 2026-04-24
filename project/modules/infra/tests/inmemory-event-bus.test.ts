import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryEventBus } from '../inmemory-event-bus';
import { EventRecord } from '../../event/types/event';

describe('InMemoryEventBus', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await expect(eventBus.connect()).resolves.toBeUndefined();
    });
  });

  describe('publish', () => {
    it('should publish event without handlers', async () => {
      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test.event',
        payload: { data: 'test' },
        createdAt: Date.now(),
      };

      await expect(eventBus.publish(event)).resolves.toBeUndefined();
    });

    it('should call subscribed handler when event is published', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      await eventBus.subscribe(handler);

      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test.event',
        payload: { key: 'value' },
        createdAt: Date.now(),
      };

      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should call multiple handlers', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      const handler3 = vi.fn().mockResolvedValue(undefined);

      await eventBus.subscribe(handler1);
      await eventBus.subscribe(handler2);
      await eventBus.subscribe(handler3);

      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test.event',
        payload: {},
        createdAt: Date.now(),
      };

      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should wait for all handlers to complete', async () => {
      const order: number[] = [];
      
      const handler1 = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push(1);
      });

      const handler2 = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        order.push(2);
      });

      await eventBus.subscribe(handler1);
      await eventBus.subscribe(handler2);

      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test',
        payload: {},
        createdAt: Date.now(),
      };

      await eventBus.publish(event);

      expect(order).toEqual([1, 2]);
    });
  });

  describe('subscribe', () => {
    it('should return unsubscribe function', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const unsubscribe = await eventBus.subscribe(handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow unsubscribing from events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const unsubscribe = await eventBus.subscribe(handler);

      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test',
        payload: {},
        createdAt: Date.now(),
      };

      await eventBus.publish(event);
      expect(handler).toHaveBeenCalledOnce();

      await unsubscribe();
      await eventBus.publish(event);
      expect(handler).toHaveBeenCalledOnce(); // Still only called once
    });

    it('should handle unsubscribing one handler while others remain', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      const unsubscribe1 = await eventBus.subscribe(handler1);
      await eventBus.subscribe(handler2);

      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test',
        payload: {},
        createdAt: Date.now(),
      };

      await unsubscribe1();
      await eventBus.publish(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });

  describe('close', () => {
    it('should close successfully', async () => {
      await expect(eventBus.close()).resolves.toBeUndefined();
    });

    it('should clear all handlers', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      await eventBus.subscribe(handler);

      await eventBus.close();

      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test',
        payload: {},
        createdAt: Date.now(),
      };

      await eventBus.publish(event);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
