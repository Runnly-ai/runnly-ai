import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, createLoggerWithOptions, LogRecord } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with info and error methods', () => {
      const logger = createLogger();
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('error');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should log info messages to console', () => {
      const logger = createLogger();
      logger.info('test message', 123);
      
      expect(console.log).toHaveBeenCalledWith('[INFO]', 'test message', 123);
    });

    it('should log error messages to console', () => {
      const logger = createLogger();
      logger.error('error message', { code: 500 });
      
      expect(console.error).toHaveBeenCalledWith('[ERROR]', 'error message', { code: 500 });
    });
  });

  describe('createLoggerWithOptions', () => {
    it('should call onLog callback with log records', () => {
      const onLog = vi.fn();
      const logger = createLoggerWithOptions({ onLog });

      logger.info('info test');
      
      expect(onLog).toHaveBeenCalledTimes(1);
      const record: LogRecord = onLog.mock.calls[0][0];
      expect(record.level).toBe('info');
      expect(record.args).toEqual(['info test']);
      expect(typeof record.createdAt).toBe('number');
    });

    it('should call onLog for error logs', () => {
      const onLog = vi.fn();
      const logger = createLoggerWithOptions({ onLog });

      logger.error('error test', 500);
      
      expect(onLog).toHaveBeenCalledTimes(1);
      const record: LogRecord = onLog.mock.calls[0][0];
      expect(record.level).toBe('error');
      expect(record.args).toEqual(['error test', 500]);
    });

    it('should not break logging if onLog throws', () => {
      const onLog = vi.fn().mockImplementation(() => {
        throw new Error('onLog error');
      });
      const logger = createLoggerWithOptions({ onLog });

      expect(() => logger.info('test')).not.toThrow();
      expect(console.log).toHaveBeenCalled();
    });

    it('should work without onLog callback', () => {
      const logger = createLoggerWithOptions();
      
      expect(() => logger.info('test')).not.toThrow();
      expect(() => logger.error('test')).not.toThrow();
    });

    it('should include timestamp in log records', () => {
      const onLog = vi.fn();
      const logger = createLoggerWithOptions({ onLog });
      
      const before = Date.now();
      logger.info('test');
      const after = Date.now();
      
      const record: LogRecord = onLog.mock.calls[0][0];
      expect(record.createdAt).toBeGreaterThanOrEqual(before);
      expect(record.createdAt).toBeLessThanOrEqual(after);
    });
  });
});
