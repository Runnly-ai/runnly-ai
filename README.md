# Runnly AI

Runnly helps you move from idea to pull request with almost no ceremony.

## How it feels

1. Send your request.
2. Grab a coffee.
3. Come back to a ready-to-review PR on your repository.

## What you can ask for

- New features
- Bug fixes
- Refactors
- Small polish tasks

## Why teams use it

- Less context switching
- Faster turnaround
- Cleaner handoff into code review

## Architecture Overview

Runnly is an event-driven workflow engine that coordinates stateless role-based agents to go from request to pull request.

### High-Level Flow

```text
Client → API → Orchestrator → Worker Agents → SCM (PR)
```

1. **Client** sends a goal (optionally with SCM context).
2. **API** creates a session and emits events.
3. **Orchestrator** subscribes to events, creates tasks, and enqueues commands.
4. **Worker agents** consume commands and execute the workflow stages.
5. **SCM module** publishes changes as a pull request.

### Workflow Stages

The session lifecycle follows a deterministic role loop:

```
SESSION_STARTED → PLAN → GENERATE → VERIFY → REVIEW → SCM PR → SESSION_COMPLETED
                                    ↑          ↑
                                    └── FIX ───┘
```

- **PLAN** — PlanningRoleAgent creates an implementation plan.
- **GENERATE/FIX** — GenerateRoleAgent writes or fixes code.
- **VERIFY** — VerifyRoleAgent runs tests and reports pass/fail.
- **REVIEW** — ReviewRoleAgent reviews code quality.

Failures in VERIFY or REVIEW loop back to GENERATE (FIX) until resolved or max cycles reached.

### Service Separation

The system can run as a single process or as three separate services:

| Service | Role | Scale |
|---|---|---|
| **API** | Session lifecycle, event stream, webhooks | Single instance |
| **Orchestrator** | Workflow state machine, event-driven transitions | Single instance (no dedup yet) |
| **Worker** | Command queue consumption, agent execution | Horizontally scalable |

### Agent Architecture

Agents are **stateless executors** that prepare task context; **providers** handle execution strategy.

- **Role Agents**: `PlanningRoleAgent`, `GenerateRoleAgent`, `VerifyRoleAgent`, `ReviewRoleAgent`
- **CLI Providers** (`codex`, `copilot`): For CLI tools with built-in agentic capabilities — format clean instructions, spawn process, capture output.
- **LLM Providers** (`openai`, `groq`, `deepseek`, `qwen`): For API-based models — build structured prompts, run a two-level loop (iteration loop + tool loop), manage conversation context.

### Pluggable Backends

All infrastructure interfaces support memory (default, for local dev) and Redis (for distributed mode):

- **Queue** — command id queue (blocking dequeue)
- **Event Bus** — pub/sub for orchestration events
- **State** — session, task, event, and command repositories
- **Database** — PR binding storage (SQLite local, Postgres production)

### Key Design Principles

- **Module-first structure**: Domain modules under `project/modules/` (session, task, command, event, orchestration, agents, infra, providers, workspace).
- **Centralized orchestration**: Workflow transitions live in `OrchestrationService`, not scattered across agents.
- **Events as coordination mechanism**: Orchestration subscribes to events; agents emit events; no direct coupling.
- **Deterministic workflow**: The stage sequence and transition policy are human-configured, not agent-decided.

### Architecture Documentation

For full details, see:

- [project/README.md](./project/README.md) — Setup, configuration, run modes, API reference
- [docs/design.md](./docs/design.md) — Overall system architecture
- [docs/agent-flow-design.md](./docs/agent-flow-design.md) — Agent and provider architecture
- [docs/priciples.md](./docs/priciples.md) — Design principles and module boundaries
- [docs/manager-agent-architecture.md](./docs/manager-agent-architecture.md) — Manager agent (intake) design

## Start here

If you want the implementation details, setup steps, and configuration options, go to:

- [project/README.md](./project/README.md)
