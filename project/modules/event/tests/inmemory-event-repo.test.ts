import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEventRepo } from '../inmemory-event-repo';
import { EventRecord } from '../types/event';

describe('InMemoryEventRepo', () => {
  let repo: InMemoryEventRepo;

  beforeEach(() => {
    repo = new InMemoryEventRepo();
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await expect(repo.connect()).resolves.toBeUndefined();
    });
  });

  describe('append', () => {
    it('should append an event', async () => {
      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test.event',
        payload: { data: 'test' },
        createdAt: Date.now(),
      };

      const result = await repo.append(event);
      expect(result).toEqual(event);
    });

    it('should store multiple events', async () => {
      const event1: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'event.one',
        payload: { value: 1 },
        createdAt: Date.now(),
      };

      const event2: EventRecord = {
        id: 'evt_2',
        sessionId: 'sess_1',
        type: 'event.two',
        payload: { value: 2 },
        createdAt: Date.now(),
      };

      await repo.append(event1);
      await repo.append(event2);

      const events = await repo.listBySessionId('sess_1');
      expect(events).toHaveLength(2);
      expect(events).toContainEqual(event1);
      expect(events).toContainEqual(event2);
    });
  });

  describe('listBySessionId', () => {
    it('should return empty array when no events exist', async () => {
      const events = await repo.listBySessionId('nonexistent');
      expect(events).toEqual([]);
    });

    it('should return events for specific session', async () => {
      const event1: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test.event',
        payload: {},
        createdAt: Date.now(),
      };

      const event2: EventRecord = {
        id: 'evt_2',
        sessionId: 'sess_2',
        type: 'test.event',
        payload: {},
        createdAt: Date.now(),
      };

      const event3: EventRecord = {
        id: 'evt_3',
        sessionId: 'sess_1',
        type: 'test.event',
        payload: {},
        createdAt: Date.now(),
      };

      await repo.append(event1);
      await repo.append(event2);
      await repo.append(event3);

      const sess1Events = await repo.listBySessionId('sess_1');
      expect(sess1Events).toHaveLength(2);
      expect(sess1Events).toContainEqual(event1);
      expect(sess1Events).toContainEqual(event3);
      expect(sess1Events).not.toContainEqual(event2);
    });

    it('should preserve event order', async () => {
      const events: EventRecord[] = [
        {
          id: 'evt_1',
          sessionId: 'sess_1',
          type: 'first',
          payload: {},
          createdAt: 100,
        },
        {
          id: 'evt_2',
          sessionId: 'sess_1',
          type: 'second',
          payload: {},
          createdAt: 200,
        },
        {
          id: 'evt_3',
          sessionId: 'sess_1',
          type: 'third',
          payload: {},
          createdAt: 300,
        },
      ];

      for (const event of events) {
        await repo.append(event);
      }

      const result = await repo.listBySessionId('sess_1');
      expect(result).toEqual(events);
    });
  });

  describe('close', () => {
    it('should close successfully', async () => {
      await expect(repo.close()).resolves.toBeUndefined();
    });

    it('should work after appending events', async () => {
      const event: EventRecord = {
        id: 'evt_1',
        sessionId: 'sess_1',
        type: 'test',
        payload: {},
        createdAt: Date.now(),
      };

      await repo.append(event);
      await expect(repo.close()).resolves.toBeUndefined();
    });
  });
});
