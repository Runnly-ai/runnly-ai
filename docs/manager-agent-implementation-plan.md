# Manager Agent Implementation Plan

## Objective
Deliver an opt-in manager-controlled workflow (`PLAN -> REACT -> VERIFY -> REVIEW`) while preserving current classic workflow behavior.

## Scope
- Add manager control-plane contracts and state machine.
- Add typed stage-output parsing/validation with fallback.
- Add orchestration path for manager mode.
- Keep worker agents compatible with minimal edits.

## Out of Scope
- Enterprise tenant features.
- Full replacement of legacy orchestration.
- Broad prompt rewrites.

## Workstreams

### WS1: Stage Output Contracts (Low risk, high value)
Files:
- `project/modules/agents/agents/types/stage-output.ts` (new)
- `project/modules/agents/agents/utils/stage-output-parser.ts` (new)
- Role agent files (small edits):
  - `planning-role-agent.ts`
  - `generate-role-agent.ts`
  - `verify-role-agent.ts`
  - `review-role-agent.ts`
  - `react-role-agent.ts`

Tasks:
1. Define envelope + per-stage schemas.
2. Implement trailing JSON extractor and safe validator.
3. In each `decide()`: parse structured output first; fallback to current logic.
4. Add `parseWarnings` into task output.

Acceptance:
- Existing behavior unchanged when no valid JSON envelope.
- Structured envelope consumed when present.

### WS2: Manager Contracts + State Machine
Files:
- `project/modules/intake/manager/types.ts` (new)
- `project/modules/intake/manager/manager-policy.ts` (new)
- `project/modules/intake/manager/manager-service.ts` (new)
- `project/modules/intake/user-intake-service.ts` (integration)

Tasks:
1. Define `ManagerBrief`, `ManagerPlan`, `ManagerDecision`, `StagePlan`.
2. Implement deterministic policy:
   - default sequence `PLAN -> REACT -> VERIFY -> REVIEW`
   - fail loops to REACT
   - max cycle guard
3. Add persistence of manager state in session context.

Acceptance:
- Manager service can compute next stage from stage results.
- State is resumable from session context.

### WS3: Orchestration Integration (Opt-in)
Files (likely):
- orchestration transition handlers
- command dispatch creation path
- runtime config for workflow mode

Tasks:
1. Add mode flag: `WORKFLOW_MODE=classic|manager` (default classic).
2. Route manager mode sessions via manager transition logic.
3. Keep classic route untouched.

Acceptance:
- `classic` mode is identical to current behavior.
- `manager` mode executes target sequence and loops correctly.

### WS4: Intake Hardening (Manager-facing)
Files:
- `project/modules/intake/user-intake-agent.ts`
- `project/modules/intake/user-intake-service.ts`

Tasks:
1. Add strict schema validation for intake parse output.
2. Fix soul profile loading path robustness.
3. Add clarification caps/timeouts (`maxRounds`, expiry).
4. Expand SCM detection consistency (e.g., include GitLab or explicitly reject unsupported providers).

Acceptance:
- Intake parse failures are explicit and observable.
- No cross-thread draft leakage from default key collisions.

### WS5: Tests + Telemetry
Files:
- intake tests (new)
- role-agent parsing tests (new)
- orchestration manager-mode tests (new)

Tasks:
1. Unit tests for schema parser/fallback.
2. Unit tests for manager policy transitions.
3. Integration test for `PLAN -> REACT -> VERIFY -> REVIEW` with fail loop.
4. Add structured logs/metrics for manager decisions and stage validation errors.

Acceptance:
- Core manager transitions covered.
- No regressions in existing tests.

## Suggested Task Breakdown for Parallel Coding Agents
1. Agent A (contracts/parser): WS1.
2. Agent B (manager state machine): WS2.
3. Agent C (orchestrator mode wiring): WS3.
4. Agent D (intake hardening + tests): WS4 + WS5 intake subset.

## Implementation Order
1. WS1 (foundation).
2. WS2 (policy/state).
3. WS3 (routing).
4. WS4 (intake hardening).
5. WS5 finalize tests and observability.

## Rollout Strategy
1. Merge behind feature flags with default classic path.
2. Enable manager mode in dev/staging for selected sessions.
3. Compare success/failure loops, latency, and regression metrics.
4. Gradually increase manager-mode traffic.

## Done Definition
1. Docs updated.
2. Feature flag exists and defaults to classic.
3. Manager mode functional end-to-end.
4. Retry loop and max cycle guard validated.
5. All critical tests pass.
