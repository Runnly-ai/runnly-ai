import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LOG_DIR = path.resolve(process.cwd(), '.factory-work/logs');
const logDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_LOG_DIR;
const outputMode = process.argv.includes('--grouped') ? 'grouped' : 'raw';
const jsonOutputArg = process.argv.find((arg) => arg.startsWith('--json-out='));
const jsonOutputFile = jsonOutputArg
  ? path.resolve(jsonOutputArg.slice('--json-out='.length))
  : path.resolve(process.cwd(), 'error-report.json');
const noJsonOutput = process.argv.includes('--no-json-out');

function isJsonLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}

function normalizeMessage(entry) {
  const parts = [entry.level, entry.source, entry.message].filter(Boolean);
  return parts.join(' | ');
}

function classifyEntry(entry) {
  const message = String(entry.message || '').toLowerCase();
  const source = String(entry.source || '').toLowerCase();
  const dataText = JSON.stringify(entry.data || {}).toLowerCase();
  const haystack = `${message} ${source} ${dataText}`;

  if (entry.level === 'error') {
    return 'error';
  }
  if (haystack.includes('failed') || haystack.includes('error') || haystack.includes('exception')) {
    return 'error-like';
  }
  if (haystack.includes('rejected unknown tool') || haystack.includes('unknown tool')) {
    return 'tool-unknown';
  }
  if (haystack.includes('tool execution failed')) {
    return 'tool-failed';
  }
  if (haystack.includes('worker shutting down, session may be incomplete')) {
    return 'incomplete-session';
  }
  if (entry.level === 'warn' || entry.level === 'warning') {
    return 'warning';
  }
  return 'info';
}

function extractIssueKey(entry) {
  const message = String(entry.message || '');
  const source = String(entry.source || '');
  const data = entry.data || {};
  const text = `${message} ${source} ${JSON.stringify(data)}`;

  const unknownToolMatch = text.match(/unknown tool(?: requested)?:\s*([a-z0-9_-]+)/i);
  if (unknownToolMatch) {
    return `unknown-tool:${unknownToolMatch[1]}`;
  }

  const toolFailedMatch = text.match(/tool execution failed for\s+([a-z0-9_-]+)/i);
  if (toolFailedMatch) {
    return `tool-failed:${toolFailedMatch[1]}`;
  }

  const providerMatch = text.match(/\[agent-provider:([^\]]+)\]/i);
  if (providerMatch) {
    return `provider:${providerMatch[1].toLowerCase()}`;
  }

  const routeMatch = text.match(/commandType":"?([A-Z]+)"?/);
  if (routeMatch) {
    return `command:${routeMatch[1]}`;
  }

  if (text.toLowerCase().includes('worker shutting down, session may be incomplete')) {
    return 'session-incomplete';
  }

  return `${entry.level || 'info'}:${source || 'unknown'}:${message.slice(0, 80)}`;
}

function extractRawErrorMessage(entry) {
  if (entry?.data?.error?.message) {
    return String(entry.data.error.message);
  }
  if (entry?.data?.message) {
    return String(entry.data.message);
  }
  return String(entry.message || '');
}

function extractRawErrorStack(entry) {
  return entry?.data?.error?.stack ? String(entry.data.error.stack) : '';
}

function isRawError(entry) {
  const message = String(entry.message || '').toLowerCase();
  const dataText = JSON.stringify(entry.data || {}).toLowerCase();
  const haystack = `${message} ${dataText}`;
  return (
    entry.level === 'error' ||
    entry.level === 'warning' ||
    haystack.includes('provider rejected unknown tool') ||
    haystack.includes('provider tool execution failed') ||
    haystack.includes('worker shutting down, session may be incomplete')
  );
}

function groupErrorsBySession(entries) {
  const sessions = new Map();
  for (const entry of entries.filter((item) => isRawError(item))) {
    const sessionId = entry.sessionId || 'unknown-session';
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    sessions.get(sessionId).push(entry);
  }
  return Array.from(sessions.entries())
    .map(([sessionId, sessionEntries]) => ({
      sessionId,
      count: sessionEntries.length,
      entries: sessionEntries,
    }))
    .sort((a, b) => b.count - a.count || a.sessionId.localeCompare(b.sessionId));
}

async function readLogFiles(rootDir) {
  const stat = await fs.stat(rootDir);
  if (stat.isFile()) {
    return [rootDir];
  }
  const entries = [];
  async function walk(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        await walk(full);
        continue;
      }
      if (dirent.isFile() && dirent.name.endsWith('.log')) {
        entries.push(full);
      }
    }
  }
  await walk(rootDir);
  return entries;
}

async function parseLogs(rootDir) {
  const files = await readLogFiles(rootDir);
  const allEntries = [];

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    for (const [index, line] of raw.split(/\r?\n/).entries()) {
      if (!line.trim() || !isJsonLine(line)) {
        continue;
      }
      try {
        const entry = JSON.parse(line);
        allEntries.push({
          file,
          line: index + 1,
          ...entry,
        });
      } catch {
        allEntries.push({
          file,
          line: index + 1,
          level: 'error',
          source: 'parser',
          message: 'invalid json log line',
          data: { raw: line.slice(0, 240) },
        });
      }
    }
  }

  return allEntries;
}

function groupEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const kind = classifyEntry(entry);
    if (kind === 'info') {
      continue;
    }
    const key = extractIssueKey(entry);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        kind,
        count: 0,
        samples: [],
        sessions: new Set(),
        sources: new Map(),
        firstSeen: entry.createdAt || Number.POSITIVE_INFINITY,
        lastSeen: entry.createdAt || 0,
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (entry.sessionId) {
      group.sessions.add(entry.sessionId);
    }
    if (entry.source) {
      group.sources.set(entry.source, (group.sources.get(entry.source) || 0) + 1);
    }
    if (typeof entry.createdAt === 'number') {
      group.firstSeen = Math.min(group.firstSeen, entry.createdAt);
      group.lastSeen = Math.max(group.lastSeen, entry.createdAt);
    }
    if (group.samples.length < 5) {
      group.samples.push({
        file: entry.file,
        line: entry.line,
        level: entry.level,
        source: entry.source,
        message: entry.message,
        data: entry.data,
      });
    }
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      sessions: Array.from(group.sessions),
      sources: Array.from(group.sources.entries()).sort((a, b) => b[1] - a[1]),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function summarize(entries) {
  const counts = {
    total: entries.length,
    error: 0,
    'error-like': 0,
    warning: 0,
    'tool-unknown': 0,
    'tool-failed': 0,
    'incomplete-session': 0,
  };

  for (const entry of entries) {
    const kind = classifyEntry(entry);
    if (counts[kind] !== undefined) {
      counts[kind] += 1;
    }
  }

  return counts;
}

async function main() {
  const entries = await parseLogs(logDir);
  const summary = summarize(entries);
  const groups = groupEntries(entries);
  const sessions = Array.from(new Set(entries.map((entry) => entry.sessionId).filter(Boolean)));
  const rawFailures = entries.filter((entry) => isRawError(entry)).map((entry) => ({
    file: path.relative(process.cwd(), entry.file),
    line: entry.line,
    sessionId: entry.sessionId || null,
    createdAt: entry.createdAt || null,
    level: entry.level || 'info',
    source: entry.source || 'unknown',
    message: entry.message || '',
    rawMessage: extractRawErrorMessage(entry),
    rawStack: extractRawErrorStack(entry),
    data: entry.data || {},
  }));
  const rawFailuresBySession = groupErrorsBySession(entries).map((group) => ({
    sessionId: group.sessionId,
    count: group.count,
    entries: group.entries.map((entry) => ({
      file: path.relative(process.cwd(), entry.file),
      line: entry.line,
      createdAt: entry.createdAt || null,
      level: entry.level || 'info',
      source: entry.source || 'unknown',
      message: entry.message || '',
      rawMessage: extractRawErrorMessage(entry),
      rawStack: extractRawErrorStack(entry),
      data: entry.data || {},
    })),
  }));

  const jsonReport = {
    logRoot: logDir,
    parsedEntries: summary.total,
    sessions: sessions.length,
    counts: {
      errors: summary.error,
      errorLike: summary['error-like'],
      warnings: summary.warning,
      unknownTools: summary['tool-unknown'],
      toolFailures: summary['tool-failed'],
      incompleteSessions: summary['incomplete-session'],
    },
    rawFailures,
    rawFailuresBySession,
  };

  if (!noJsonOutput && jsonOutputFile) {
    await fs.writeFile(jsonOutputFile, `${JSON.stringify(jsonReport, null, 2)}\n`, 'utf8');
  }

  console.log(`Log root: ${logDir}`);
  console.log(`Parsed entries: ${summary.total}`);
  console.log(`Sessions: ${sessions.length}`);
  console.log(`Errors: ${summary.error} | Error-like: ${summary['error-like']} | Warnings: ${summary.warning}`);
  console.log(`Unknown tools: ${summary['tool-unknown']} | Tool failures: ${summary['tool-failed']} | Incomplete sessions: ${summary['incomplete-session']}`);
  console.log('');

  const filtered = entries.filter((entry) => isRawError(entry));
  if (outputMode === 'raw') {
    console.log('Raw errors:');
    if (filtered.length === 0) {
      console.log('- none found');
      return;
    }

    for (const sessionGroup of groupErrorsBySession(entries)) {
      console.log(`Session: ${sessionGroup.sessionId} (${sessionGroup.count})`);
      for (const entry of sessionGroup.entries) {
        const relFile = path.relative(process.cwd(), entry.file);
        const rawMessage = extractRawErrorMessage(entry);
        console.log(
          `  ${relFile}:${entry.line} | ${entry.level || 'info'} | ${entry.source || 'unknown'} | ${rawMessage}`
        );
        const rawStack = extractRawErrorStack(entry);
        if (rawStack) {
          console.log(rawStack);
        }
        if (entry.data && Object.keys(entry.data).length > 0) {
          console.log(`    data=${JSON.stringify(entry.data)}`);
        }
      }
    }
    return;
  }

  console.log('Top issues:');
  if (groups.length === 0) {
    console.log('- none found');
    return;
  }

  for (const group of groups.slice(0, 20)) {
    const firstSeen = Number.isFinite(group.firstSeen) ? new Date(group.firstSeen).toISOString() : 'n/a';
    const lastSeen = group.lastSeen ? new Date(group.lastSeen).toISOString() : 'n/a';
    console.log(`- [${group.kind}] ${group.key} (${group.count})`);
    console.log(`  where: sessions=${group.sessions.length}, sources=${group.sources.map(([source]) => source).join(', ') || 'n/a'}`);
    console.log(`  when: first=${firstSeen}, last=${lastSeen}`);
    console.log(`  why: ${extractReasonHint(group.samples[0] || {})}`);
    for (const sample of group.samples.slice(0, 2)) {
      const dataKeys = sample.data && typeof sample.data === 'object' ? Object.keys(sample.data).slice(0, 6) : [];
      const commandType = sample.data?.commandType || sample.data?.type || sample.data?.taskType || '';
      const commandId = sample.data?.commandId || sample.data?.taskId || '';
      console.log(
        `  - ${path.relative(process.cwd(), sample.file)}:${sample.line} ${normalizeMessage(sample)}${commandType ? ` | commandType=${commandType}` : ''}${commandId ? ` | id=${commandId}` : ''}${dataKeys.length ? ` | dataKeys=${dataKeys.join(',')}` : ''}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
