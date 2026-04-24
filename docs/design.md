# Runnly.AI - Architecture

## 1. Goal

Event-driven software workflow engine:

`Session -> Plan -> Implement -> Test -> Review -> Complete`

Core properties:
- centralized orchestration
- stateless agent execution
- pluggable queue/event/state backends
- module/domain-based code organization

## 2. Runtime Architecture

```text
Client
  |
  v
Express API (api/server.ts)
  - SessionService
  - EventService
  - optional OrchestrationService subscriber
  - optional AgentRuntime worker loop
  |
  +--> State Repos (memory or Redis)
  +--> Event Bus (memory or Redis)
  +--> Command Queue (memory or Redis)

Worker Process(es)
  - AgentRuntime
  - AgentRegistry
  - Agents (planner/coder/tester/reviewer)
  |
  +--> same shared State Repos
  +--> same shared Event Bus
  +--> same shared Command Queue
```

Composition root:
- `project/runtime/index.ts` builds queue, event bus, repos, services, agents, and runtime.
- `project/index.ts` starts Express + process lifecycle hooks.

## 3. Module Layout

```text
project/modules/
  agents/          # runtime worker + concrete agents + registry
  session/         # session types, repos, service, view
  task/            # task types, repos, service
  command/         # command types, repos, service
  event/           # event types, repos, service
  orchestration/   # workflow state machine transitions
  infra/           # queue/event-bus interfaces and adapters
  providers/       # logger + CLI providers
  workspace/       # workspace contract + local adapter
  utils/           # id/time/progress helpers
```

## 4. Core Components

### 4.1 SessionService
- Creates sessions.
- Starts sessions and emits `SESSION_STARTED`.
- Builds session view projection from tasks + events.

### 4.2 OrchestrationService
- Subscribes to events.
- Owns workflow transitions.
- Creates tasks and dispatches commands.

### 4.3 EventService
- Appends events in EventRepo.
- Publishes events to EventBus.
- Supports subscription for orchestration.

### 4.4 CommandService
- Persists command records.
- Enqueues command ids.
- Tracks command lifecycle state.

### 4.5 AgentRuntime
- Dequeues command ids.
- Resolves agent by capability mapping.
- Executes agent and updates command state/events.

### 4.6 Agents

**Architecture Principle:** Agents prepare task context; providers handle execution strategy.

- Stateless executors for command types.
- Extract task context from commands (userRequest, projectContext, requirements, etc.).
- Call `AgentProviderRouter` with structured input.
- Interpret provider results and emit workflow events.
- Update task state based on execution outcome.

**Agent Hierarchy:**
- `Agent` interface: `id`, `capabilities`, `execute(command, context)`
- `RoleAgent` base class: context extraction and provider delegation
- Concrete agents: `PlanningRoleAgent`, `GenerateRoleAgent`, `VerifyRoleAgent`, `ReviewRoleAgent`

**Provider Separation:**
- `CliAgentProvider`: For CLI tools (codex/copilot) with internal loops
  - Formats clean instructions without prompts
  - Spawns CLI process and captures output
- `LlmAgentProvider`: For LLM providers (openai/groq/deepseek/qwen)
  - Builds structured prompts from role-specific prompt sets
  - Implements two-level loop: iteration loop + tool loop
  - Manages conversation context across iterations

Workflow events:
- `PLAN_COMPLETED` - Planning agent finished
- `IMPLEMENT_COMPLETED` - Generate agent finished
- `TEST_PASSED` / `TEST_FAILED` - Verify agent results
- `REVIEW_COMPLETED` / `REVIEW_FAILED` - Review agent results

## 5. Workflow State Machine

- `SESSION_STARTED` -> create PLAN task -> dispatch `PLAN`
- `PLAN_COMPLETED` -> create IMPLEMENT task -> dispatch `GENERATE`
- `IMPLEMENT_COMPLETED` (all IMPLEMENT done) -> create TEST task -> dispatch `VERIFY`
- `TEST_FAILED` -> create IMPLEMENT fix task -> dispatch `FIX`
- `TEST_PASSED` -> create REVIEW task -> dispatch `REVIEW`
- `REVIEW_COMPLETED` -> mark session `COMPLETED` + emit `SESSION_COMPLETED`
- `COMMAND_FAILED` -> mark session `FAILED`

## 6. Data Model

### Session
- `id`, `goal`, `status`, `context`, `createdAt`, `updatedAt`

### Task
- `id`, `sessionId`, `type`, `title`, `status`, `input`, `output`, `createdAt`, `updatedAt`

### Event
- `id`, `sessionId`, `type`, `payload`, `createdAt`

### Command
- `id`, `sessionId`, `type`, `payload`, `status`, `retryCount`, `createdAt`, `updatedAt`

## 7. Backends

### Queue
- Interface: `enqueue(commandId)`, `dequeue(timeoutMs)`
- Backends: in-memory queue, Redis queue

### Event Bus
- Interface: `publish(event)`, `subscribe(handler)`
- Backends: in-memory pub/sub, Redis pub/sub

### State Repositories
- Interfaces owned by domain modules (`session/task/event/command`)
- Backends: in-memory and Redis

## 8. Known Limits

- Redis pub/sub is at-most-once and non-replayable.
- Multiple orchestrators can duplicate side effects without dedup/locking.
- Retry handling is minimal (`retryCount` only).
- No dead-letter queue yet.

## 9. Hardening Priorities

1. Add orchestration idempotency and locking.
2. Add durable event transport (for example Redis Streams).
3. Add retry policy with backoff + dead-letter handling.
4. Add observability for queue latency, event lag, and command outcomes.

## 10. Deployment Baseline

Current demo deployment scaffolding:
- GitHub Actions CI validates the Node build.
- GitHub Actions validates Terraform under `infra/terraform`.
- Terraform currently provisions the Azure demo foundation only.

This does not yet deploy the TypeScript backend into Azure.
