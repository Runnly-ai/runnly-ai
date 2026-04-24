# Runnly.AI - Implementation Plan

This plan is aligned to the current module/domain architecture in `project/modules`.

## 1. Current Baseline

Already implemented:
- Express API (`project/api/server.ts`)
- Composition root (`project/runtime/index.ts`)
- Domain modules: `session`, `task`, `command`, `event`, `orchestration`
- Agent runtime and concrete agents
- Memory + Redis adapters for queue/event/state
- Session workflow orchestration via domain events

Current agent maturity:
- Agent architecture refactored: agents prepare context, providers handle execution
- Provider separation: CLI providers (codex/copilot) vs LLM providers (openai/groq/deepseek/qwen)
- Role agents implemented: `PlanningRoleAgent`, `GenerateRoleAgent`, `VerifyRoleAgent`, `ReviewRoleAgent`
- LLM providers include two-level loop system (iteration + tool loops)
- Prompts organized and mapped per role (planning, generate, verify, review)
- Runtime execution functional with backward compatibility

## 2. Alignment Rules

- Keep domain behavior inside module services.
- Keep runtime thin (wire + loop + lifecycle only).
- Keep agents stateless and capability-driven.
- Keep orchestration transitions centralized.
- Update docs when module boundaries change.

## 3. Near-Term Work Plan

### Phase A: Agent Enhancement (Priority)
- [x] Refactor agent architecture: separate agents (context) from providers (execution)
- [x] Implement role-based agents: Planning, Generate, Verify, Review
- [x] Add CLI provider support with clean instruction formatting
- [x] Add LLM provider support with two-level loop system
- [x] Organize prompts per role with mapping structure
- [ ] Add comprehensive error handling and recovery in providers
- [ ] Enhance tool execution safety and sandboxing
- [ ] Add provider result validation and schema enforcement
- [ ] Add per-agent integration tests with deterministic fixtures/mocks

### Phase B: API and Runtime Hardening
- [ ] Add request validation layer for API payloads.
- [ ] Add startup diagnostics for backend mode (memory vs Redis).
- [ ] Add graceful shutdown timeout and forced-exit fallback.

### Phase B2: Demo Infrastructure
- [x] Add Terraform scaffold for Azure demo foundation.
- [x] Add GitHub Actions CI for the Node build.
- [x] Add GitHub Actions Terraform validation.
- [ ] Add Azure auth and Terraform apply workflow.
- [ ] Add backend deployment target for Azure.

### Phase C: Workflow Safety
- [ ] Add orchestration idempotency keys.
- [ ] Add duplicate-event guards for transition handlers.
- [ ] Add stronger failure payload schema for `COMMAND_FAILED`.

### Phase D: Reliability
- [ ] Add retry policy with max-attempts/backoff.
- [ ] Add dead-letter strategy for poison commands.
- [ ] Add durable event transport option (for example Redis Streams).

### Phase E: Observability
- [ ] Add structured logs with correlation ids (`sessionId`, `taskId`, `commandId`).
- [ ] Add metrics: queue depth, dequeue latency, command outcome counters.
- [ ] Add workflow timeline tracing per session.

### Phase F: Test Coverage
- [ ] Add unit tests for module services.
- [ ] Add integration tests for orchestration transitions.
- [ ] Add end-to-end smoke test from session creation to completion.

## 4. Ownership Map (Current)

- `project/modules/session`: session types/repos/service/view
- `project/modules/task`: task types/repos/service
- `project/modules/command`: command types/repos/service
- `project/modules/event`: event types/repos/service
- `project/modules/orchestration`: workflow transition logic
- `project/modules/agents`: agent contracts/implementations/registry/runtime
- `project/modules/infra`: queue/event bus contracts + adapters
- `project/modules/providers`: logger and CLI providers
- `project/modules/workspace`: workspace contract + adapters
- `project/modules/utils`: pure utility functions
- `project/api`: Express API entry
- `project/runtime`: composition root

## 5. Non-Goals (Current)

- UI product features beyond simple integration hooks.
- Multi-tenant authorization model.
- Full production SRE stack.
