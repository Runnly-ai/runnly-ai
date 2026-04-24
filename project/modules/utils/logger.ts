/**
 * Logger provider contract.
 */
export interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface LogRecord {
  level: 'info' | 'error';
  args: unknown[];
  createdAt: number;
}

interface CreateLoggerOptions {
  onLog?: (record: LogRecord) => void;
}

/**
 * Creates a console-backed logger.
 *
 * @returns Logger instance.
 */
export function createLogger(): Logger {
  return createLoggerWithOptions();
}

/**
 * Creates a console-backed logger with optional record sink callback.
 */
export function createLoggerWithOptions(options: CreateLoggerOptions = {}): Logger {
  const emit = (record: LogRecord) => {
    if (!options.onLog) {
      return;
    }
    try {
      options.onLog(record);
    } catch {
      // Never break primary logging flow due to secondary sink failure.
    }
  };

  return {
    info: (...args: unknown[]) => {
      console.log('[INFO]', ...args);
      emit({
        level: 'info',
        args,
        createdAt: Date.now(),
      });
    },
    error: (...args: unknown[]) => {
      console.error('[ERROR]', ...args);
      emit({
        level: 'error',
        args,
        createdAt: Date.now(),
      });
    },
  };
}
