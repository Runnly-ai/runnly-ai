import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password-hasher';

describe('password-hasher', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'mySecurePassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash).toContain(':');
    });

    it('should produce different hashes for same password', async () => {
      const password = 'testPassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should hash include salt and derived key', async () => {
      const hash = await hashPassword('test');
      const parts = hash.split(':');
      
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBeTruthy(); // salt
      expect(parts[1]).toBeTruthy(); // derived key
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'correctPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correctPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should reject invalid hash format', async () => {
      const isValid = await verifyPassword('password', 'invalid-hash');
      expect(isValid).toBe(false);
    });

    it('should reject hash without separator', async () => {
      const isValid = await verifyPassword('password', 'nocoloninhash');
      expect(isValid).toBe(false);
    });

    it('should reject empty hash', async () => {
      const isValid = await verifyPassword('password', '');
      expect(isValid).toBe(false);
    });

    it('should reject hash with only salt', async () => {
      const isValid = await verifyPassword('password', 'onlysalt:');
      expect(isValid).toBe(false);
    });

    it('should handle special characters in password', async () => {
      const password = 'p@ssw0rd!#$%^&*()';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should be case sensitive', async () => {
      const password = 'Password123';
      const hash = await hashPassword(password);
      
      const isValidLower = await verifyPassword('password123', hash);
      const isValidUpper = await verifyPassword('PASSWORD123', hash);
      
      expect(isValidLower).toBe(false);
      expect(isValidUpper).toBe(false);
    });
  });
});
