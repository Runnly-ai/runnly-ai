import { describe, it, expect } from 'vitest';
import { generateSessionToken, hashSessionToken } from '../token-utils';

describe('token-utils', () => {
  describe('generateSessionToken', () => {
    it('should generate a token', () => {
      const token = generateSessionToken();
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes in hex = 64 characters
    });

    it('should generate unique tokens', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();
      
      expect(token1).not.toBe(token2);
    });

    it('should generate hexadecimal tokens', () => {
      const token = generateSessionToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('hashSessionToken', () => {
    it('should hash a token', () => {
      const token = 'test-token-123';
      const hash = hashSessionToken(token);
      
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    it('should produce consistent hashes', () => {
      const token = 'consistent-token';
      const hash1 = hashSessionToken(token);
      const hash2 = hashSessionToken(token);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = hashSessionToken('token1');
      const hash2 = hashSessionToken('token2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce hexadecimal hash', () => {
      const hash = hashSessionToken('test');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be case sensitive', () => {
      const hash1 = hashSessionToken('Token');
      const hash2 = hashSessionToken('token');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('integration', () => {
    it('should work together for session token flow', () => {
      const token = generateSessionToken();
      const hash = hashSessionToken(token);
      
      expect(token).toBeTruthy();
      expect(hash).toBeTruthy();
      expect(token).not.toBe(hash);
      expect(hash.length).toBe(64);
    });
  });
});
