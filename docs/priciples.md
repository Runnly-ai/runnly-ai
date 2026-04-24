# Runnly.AI - Principles

This document defines the architectural guardrails for the module/domain-based backend.

## 1. Module-First Structure

The codebase is organized by domain modules under `project/modules/`.

```text
project/
  modules/
    agents/
    command/
    event/
    orchestration/
    session/
    task/
    infra/
    providers/
    utils/
    workspace/
  api/
  runtime/
  config/
  index.ts
```

### Domain modules
- `session`, `task`, `command`, `event`, `orchestration`
- Each module owns its contracts, repository implementations, and service logic.

### Cross-cutting modules
- `infra`: queue and event bus adapters (memory/redis)
- `providers`: logger and CLI runner adapters
- `utils`: pure helpers (`id`, `time`, `progress`)
- `workspace`: workspace abstraction and local implementation
- `agents`: runtime worker and capability-based agents

## 2. Dependency Direction

The allowed direction is:

`types/contracts -> repositories/adapters -> services -> runtime/api`

Practical rules:
- API and runtime act as entry points and composition boundaries.
- Business logic lives in services, not in API handlers.
- Runtime loop stays thin and delegates work to services + agents.
- Providers/infra are adapter boundaries and should not contain workflow logic.

## 3. Orchestration Rules

- Workflow transitions are centralized in `OrchestrationService`.
- Agents remain stateless executors.
- Session progress is derived from tasks/events, not duplicated mutable state.
- Events are the coordination mechanism between orchestration and execution.

## 4. Backends and Runtime Topologies

All state/queue/event interfaces support memory and Redis implementations.

### Local single process
- API + orchestrator + worker in one process.
- Use memory backends by default.

### Distributed
- API/orchestrator process and one or more worker processes.
- Use Redis for queue, event bus, and state.

## 5. Runtime Layer Intent

Runtime code is an entrypoint layer.

It should:
- wire dependencies
- consume queue/events
- hand work to services/agents
- handle process lifecycle

It should not:
- implement core workflow decisions (belongs to orchestration service)
- embed data access logic (belongs to module repos)

## 6. Documentation Alignment Requirement

When module boundaries or folder layout changes, update these files together:
- `docs/design.md`
- `docs/implementation_plan.md`
- `project/README.md`
- `project/IMPLEMENTATION_PLAN.md`
