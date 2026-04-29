# Manager Agent Architecture Design

## Status
Draft v1 (for implementation handoff)

## Context
Current system has a user intake agent and a multi-agent execution workflow (`PLAN -> GENERATE/FIX -> VERIFY -> REVIEW`) coordinated by orchestration events.

We want the intake layer to become a true user-facing manager/orchestrator that controls sub-agent workflow decisions while keeping current worker agents stable.

## Goals
1. Make intake the client manager for execution workflows.
2. Keep existing worker agents (`PlanningRoleAgent`, `Generate/ReAct`, `Verify`, `Review`) reusable.
3. Improve reliability with typed contracts between manager and workers.
4. Support an opt-in manager-controlled workflow mode without breaking current flow.

## Non-Goals
1. No full rewrite of orchestration runtime.
2. No immediate prompt overhaul across all agents.
3. No enterprise tenant model in this phase.

## Target Architecture

### Roles
- Manager Agent (control plane): user-facing, decides workflow and dispatches stages.
- Worker Agents (data plane): perform stage execution and return structured stage results.

### Control/Data Flow
1. User message -> `ManagerService`.
2. `ManagerService` builds validated `ManagerBrief`.
3. `ManagerService` decides workflow mode and creates `ManagerPlan`.
4. Orchestrator/dispatcher executes stage commands from plan.
5. Worker emits `StageResultEnvelope`.
6. `ManagerService` evaluates result and decides `advance | retry | clarify | abort`.
7. Loop until completion criteria met.

## Proposed Contracts

### ManagerBrief
- `goal: string`
- `scope?: string`
- `constraints?: Record<string, unknown>`
- `acceptanceCriteria?: string[]`
- `riskLevel: 'low' | 'medium' | 'high'`
- `scmContext?: { provider?: string; repoUrl?: string; baseBranch?: string }`
- `workflowMode: 'classic' | 'react_pipeline' | 'manager_controlled'`

### ManagerPlan
- `planId: string`
- `version: '1'`
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
1. Default manager-controlled sequence: `PLAN -> REACT -> VERIFY -> REVIEW`.
2. `VERIFY FAIL -> REACT`.
3. `REVIEW FAIL -> REACT`.
4. Stop when `VERIFY PASS` and `REVIEW PASS`.
5. Abort if cycle count exceeds `maxCycles`.

## Backward Compatibility Strategy
1. Preserve current `classic` orchestration path as default.
2. Introduce feature flag/config gate for manager-controlled path.
3. Keep worker prompt/output behavior and add parser fallback.
4. Keep existing events and payloads where possible.

## Required Module Changes

### Intake / Manager
- Evolve intake output to produce `ManagerBrief`.
- Add decision state machine: `INTAKE -> CLARIFY -> PLAN_WORKFLOW -> DISPATCH -> EVALUATE -> COMPLETE`.

### Agent Output Contracts
- Add typed stage-output schemas and parser utilities.
- Parse structured outputs first, fallback to current regex/string extraction.

### Orchestration
- Add optional manager-controlled routing for stage transitions.
- Preserve current command/event flow for classic mode.

## Persistence Additions (session context)
- `manager.brief`
- `manager.plan`
- `manager.currentStage`
- `manager.cycleCount`
- `manager.lastDecision`
- `manager.stageHistory[]`

## Observability
Track metrics/log fields:
- intake parse success/fallback rate
- clarification rounds
- stage schema validation failures
- verify/review retry counts
- loop abort due to `maxCycles`

## Risks and Mitigations
1. Risk: manager logic conflicts with existing orchestrator transitions.
- Mitigation: isolate behind mode flag and explicit transition table.

2. Risk: worker outputs are inconsistent for strict schemas.
- Mitigation: parser fallback + phased prompt tightening.

3. Risk: increased complexity in intake path.
- Mitigation: keep manager state machine small and deterministic.

## Rollout Plan
1. Phase 1: contracts + parser + no-op manager scaffolding.
2. Phase 2: manager-controlled routing (opt-in).
3. Phase 3: prompt/UX refinements and telemetry tuning.

## Success Criteria
1. Manager mode can run `PLAN -> REACT -> VERIFY -> REVIEW` end-to-end.
2. On verify/review failure, system routes back to REACT up to max cycles.
3. No regression in classic mode.
4. Structured stage outputs validated with fallback compatibility.
