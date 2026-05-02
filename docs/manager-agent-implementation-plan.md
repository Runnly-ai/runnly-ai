# Manager Agent Implementation Plan

## Objective
Deliver a manager brief-and-handoff layer while preserving deterministic, human-configured workflow behavior.

## Scope
- Add manager control-plane contracts and state machine.
- Add typed stage-output parsing/validation with fallback.
- Add orchestration path that consumes the configured workflow.
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
1. Define `ManagerBrief`, `ManagerDecision`, and handoff metadata.
2. Implement deterministic policy for brief quality and clarification only.
3. Add persistence of manager brief and open questions in session context.

Acceptance:
- Manager service can produce a validated brief from user input.
- State is resumable from session context.

### WS3: Orchestration Integration (Opt-in)
Files (likely):
- orchestration transition handlers
- command dispatch creation path
- runtime config for workflow definition

Tasks:
1. Read workflow selection from human config.
2. Route sessions through the configured transition logic.
3. Keep classic route untouched.

Acceptance:
- `classic` mode is identical to current behavior.
- Configured workflows execute their target sequence and loops correctly.

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
- orchestration workflow-definition tests (new)

Tasks:
1. Unit tests for schema parser/fallback.
2. Unit tests for manager brief and clarification transitions.
3. Integration test for the configured workflow with fail loop.
4. Add structured logs/metrics for manager brief quality and stage validation errors.

Acceptance:
- Core manager brief transitions covered.
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
2. Load workflow selection from human config in dev/staging.
3. Compare success/failure loops, latency, and regression metrics.
4. Gradually increase usage of the configured workflow set.

## Done Definition
1. Docs updated.
2. Workflow selection exists in human config and defaults to classic.
3. Manager brief-and-handoff functional end-to-end.
4. Retry loop and max cycle guard validated by configured workflow.
5. All critical tests pass.
