import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteDatabaseClient } from '../sqlite-client';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('SqliteDatabaseClient', () => {
  let client: SqliteDatabaseClient;
  let tempDbPath: string;

  beforeEach(async () => {
    const tempDir = path.join(os.tmpdir(), 'vitest-db-test');
    await fs.mkdir(tempDir, { recursive: true });
    tempDbPath = path.join(tempDir, `test-${Date.now()}.db`);
    client = new SqliteDatabaseClient(tempDbPath);
  });

  afterEach(async () => {
    try {
      await client.close();
      await fs.unlink(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('connect', () => {
    it('should connect to database', async () => {
      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('should create database file', async () => {
      await client.connect();
      const stats = await fs.stat(tempDbPath);
      expect(stats.isFile()).toBe(true);
    });

    it('should handle multiple connect calls', async () => {
      await client.connect();
      await expect(client.connect()).resolves.toBeUndefined();
    });
  });

  describe('run', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should execute CREATE TABLE statement', async () => {
      const result = await client.run(
        'CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)'
      );
      expect(result.affectedRows).toBe(0);
    });

    it('should execute INSERT statement', async () => {
      await client.run('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      const result = await client.run('INSERT INTO users (name) VALUES (?)', ['Alice']);
      expect(result.affectedRows).toBe(1);
    });

    it('should execute UPDATE statement', async () => {
      await client.run('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      await client.run('INSERT INTO users (name) VALUES (?)', ['Alice']);
      const result = await client.run('UPDATE users SET name = ? WHERE name = ?', ['Bob', 'Alice']);
      expect(result.affectedRows).toBe(1);
    });

    it('should throw error for invalid SQL', async () => {
      await expect(client.run('INVALID SQL')).rejects.toThrow();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await client.connect();
      await client.run('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');
    });

    it('should return empty array for no results', async () => {
      const results = await client.query('SELECT * FROM users');
      expect(results).toEqual([]);
    });

    it('should return query results', async () => {
      await client.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30]);
      await client.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25]);

      const results = await client.query<{ id: number; name: string; age: number }>(
        'SELECT * FROM users ORDER BY age'
      );

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Bob');
      expect(results[0].age).toBe(25);
      expect(results[1].name).toBe('Alice');
      expect(results[1].age).toBe(30);
    });

    it('should handle parameterized queries', async () => {
      await client.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30]);
      await client.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25]);

      const results = await client.query<{ name: string }>(
        'SELECT name FROM users WHERE age > ?',
        [26]
      );

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice');
    });

    it('should throw error for invalid query', async () => {
      await expect(client.query('SELECT * FROM nonexistent_table')).rejects.toThrow();
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      await client.connect();
      await expect(client.close()).resolves.toBeUndefined();
    });

    it('should handle close when not connected', async () => {
      await expect(client.close()).resolves.toBeUndefined();
    });

    it('should handle multiple close calls', async () => {
      await client.connect();
      await client.close();
      await expect(client.close()).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw error when querying without connection', async () => {
      await expect(client.query('SELECT 1')).rejects.toThrow('not connected');
    });

    it('should throw error when running without connection', async () => {
      await expect(client.run('SELECT 1')).rejects.toThrow('not connected');
    });
  });
});
