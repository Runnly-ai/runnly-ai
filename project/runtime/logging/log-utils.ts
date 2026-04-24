import { LogRecord } from '../../modules/utils/logger';

/**
 * Creates a structured log event payload from a log record.
 * Returns null if no sessionId is present.
 */
export function createLogEventPayload(record: LogRecord, logVerbose: boolean): Record<string, unknown> | null {
  const [rawMessage, rawData] = record.args;
  const message = typeof rawMessage === 'string' ? rawMessage : String(rawMessage);
  const data = rawData && typeof rawData === 'object' ? redactSensitive(rawData as Record<string, unknown>) : {};
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  if (!sessionId) {
    return null;
  }

  return {
    sessionId,
    level: record.level,
    message,
    source: inferSource(message),
    createdAt: record.createdAt,
    ...(logVerbose ? { data } : {}),
  };
}

/**
 * Infers the log source/subsystem from the message text.
 */
function inferSource(message: string): string {
  const prefixMatch = /^\[([^\]]+)\]/.exec(message);
  if (prefixMatch) {
    return prefixMatch[1];
  }
  if (message.startsWith('scm ')) {
    return 'scm';
  }
  if (message.startsWith('worker ')) {
    return 'runtime';
  }
  if (message.startsWith('orchestrator ')) {
    return 'orchestrator';
  }
  return 'app';
}

/**
 * Redacts sensitive keys from log data.
 */
function redactSensitive(input: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(['token', 'authorization', 'apiKey', 'api_key', 'secret', 'password']);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (blocked.has(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactSensitive(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}
