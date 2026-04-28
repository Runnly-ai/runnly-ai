# Scripts

## `analyze-factory-work-logs.mjs`

Analyze `.factory-work/logs` session files and export raw failure data.

### What it does

- Reads either a single `.log` file or a directory of `.log` files.
- Groups raw failures by `sessionId`.
- Prints the raw error message and stack trace.
- Writes a formatted JSON report by default.

### Usage

Analyze the whole log directory:

```bash
node scripts/analyze-factory-work-logs.mjs .factory-work/logs
```

Analyze a single session file:

```bash
node scripts/analyze-factory-work-logs.mjs .factory-work/logs/sessions/<session-id>.log
```

Write the JSON report to a custom file:

```bash
node scripts/analyze-factory-work-logs.mjs .factory-work/logs --json-out=reports/error-report.json
```

Disable JSON file output:

```bash
node scripts/analyze-factory-work-logs.mjs .factory-work/logs --no-json-out
```

Grouped summary mode:

```bash
node scripts/analyze-factory-work-logs.mjs .factory-work/logs --grouped
```

### Output files

- Default JSON output: `./error-report.json`
- Custom output: use `--json-out=...`

