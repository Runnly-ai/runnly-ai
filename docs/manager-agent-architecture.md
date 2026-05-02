# Manager Agent Architecture Design

## Status
Draft v1 (for implementation handoff)

## Context
Current system has a user intake agent and a multi-agent execution workflow (`PLAN -> GENERATE/FIX -> VERIFY -> REVIEW`) coordinated by orchestration events.

We want the intake layer to become a true user-facing manager that understands the request, produces a brief, and hands it to orchestration while keeping current worker agents stable.

## Goals
1. Make intake the client-facing manager for request understanding and handoff.
2. Keep existing worker agents (`PlanningRoleAgent`, `Generate/ReAct`, `Verify`, `Review`) reusable.
3. Improve reliability with typed contracts between manager and workers.
4. Keep workflow selection deterministic and human-configured.

## Non-Goals
1. No full rewrite of orchestration runtime.
2. No immediate prompt overhaul across all agents.
3. No enterprise tenant model in this phase.

## Target Architecture

### Roles
- Manager Agent (control plane): user-facing, captures intent, clarifies gaps, and produces a brief.
- Worker Agents (data plane): perform stage execution and return structured stage results.

### Control/Data Flow
1. User message -> `ManagerService`.
2. `ManagerService` builds validated `ManagerBrief`.
3. Orchestration selects the configured workflow path.
4. Orchestrator/dispatcher executes stage commands from that workflow.
5. Worker emits `StageResultEnvelope`.
6. Orchestration applies the configured transition policy.
7. Loop until completion criteria met.

## Proposed Contracts

### ManagerBrief
- `goal: string`
- `scope?: string`
- `constraints?: Record<string, unknown>`
- `acceptanceCriteria?: string[]`
- `riskLevel: 'low' | 'medium' | 'high'`
- `scmContext?: { provider?: string; repoUrl?: string; baseBranch?: string }`
- `contextSignals?: Record<string, unknown>`
- `openQuestions?: string[]`

### Workflow Configuration
- `workflowMode: 'classic' | 'react_pipeline' | 'manager_controlled'`
- `configuredByHuman: true`
- `stages: StagePlan[]`
- `maxCycles: number`

### StagePlan
- `stageId: string`
- `type: 'PLAN' | 'REACT' | 'VERIFY' | 'REVIEW'`
- `agentCapability: 'plan' | 'react' | 'verify' | 'review'`
- `inputArtifacts: string[]`
- `outputSchema: string` (schema id)
- `onPass?: string`
- `onFail?: string`

### StageResultEnvelope
- `schemaVersion: '1'`
- `stageId: string`
- `done: boolean`
- `verdict?: 'PASS' | 'FAIL'`
- `summary: string`
- `reason?: string`
- `payload?: Record<string, unknown>`

## Workflow Policy (initial)
1. Workflow sequence is defined by human configuration, not by the manager agent.
2. The manager agent only supplies the brief and handoff context.
3. Orchestration follows the configured transition policy exactly.
4. `VERIFY FAIL` and `REVIEW FAIL` transitions are determined by the configured workflow.
5. Abort if cycle count exceeds `maxCycles`.

## Backward Compatibility Strategy
1. Preserve current `classic` orchestration path as default.
2. Keep workflow selection in human config or feature flags, not agent output.
3. Keep worker prompt/output behavior and add parser fallback.
4. Keep existing events and payloads where possible.

## Required Module Changes

### Intake / Manager
- Evolve intake output to produce `ManagerBrief`.
- Add decision state machine: `INTAKE -> CLARIFY -> BRIEF -> HANDOFF -> COMPLETE`.

### Agent Output Contracts
- Add typed stage-output schemas and parser utilities.
- Parse structured outputs first, fallback to current regex/string extraction.

### Orchestration
- Add routing based on the configured workflow definition.
- Preserve current command/event flow for classic mode.

## Persistence Additions (session context)
- `manager.brief`
- `manager.openQuestions`
- `workflow.config`
- `workflow.currentStage`
- `workflow.cycleCount`
- `workflow.stageHistory[]`

## Observability
Track metrics/log fields:
- intake parse success/fallback rate
- clarification rounds
- stage schema validation failures
- verify/review retry counts
- loop abort due to `maxCycles`

## Risks and Mitigations
1. Risk: manager logic conflicts with existing orchestrator transitions.
- Mitigation: keep workflow ownership in deterministic config and explicit transition table.

2. Risk: worker outputs are inconsistent for strict schemas.
- Mitigation: parser fallback + phased prompt tightening.

3. Risk: increased complexity in intake path.
- Mitigation: keep manager state machine small and deterministic.

## Rollout Plan
1. Phase 1: contracts + parser + no-op manager scaffolding.
2. Phase 2: human-configured workflow wiring.
3. Phase 3: prompt/UX refinements and telemetry tuning.

## Success Criteria
1. Manager mode can produce a brief and hand it off cleanly.
2. On verify/review failure, the configured workflow routes correctly up to max cycles.
3. No regression in classic mode.
4. Structured stage outputs validated with fallback compatibility.
