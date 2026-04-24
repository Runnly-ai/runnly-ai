# Role-Agent Flow Design

## Goal

Refactor session execution to a generic role loop with provider-agnostic agents:

1. plan
2. generate
3. verify
4. review

Feedback loops:
- verify failed -> generate
- review failed -> generate

## Agent Architecture (Refactored)

**Core Principle:** Agents prepare task context; providers handle execution strategy.

- `Agent` interface: execution contract (`id`, `capabilities`, `execute()`).
- `RoleAgent` abstract class: simplified base for role-based agents.
  - Extracts task context from commands (userRequest, projectContext, requirements, etc.)
  - Calls `AgentProviderRouter.run()` with structured input
  - Implements abstract `decide()` method to interpret provider results
  - **Does NOT** build prompts or handle execution loops
- Concrete role agents:
  - `PlanningRoleAgent`
  - `GenerateRoleAgent`
  - `VerifyRoleAgent`
  - `ReviewRoleAgent`

**Removed abstractions:**
- `RoleLoopAgent` - loop logic moved to providers
- `CliAgent` - unnecessary wrapper layer

## Provider Architecture (Refactored)

**Core Principle:** Providers handle execution strategy, not agents.

- `AgentProvider` interface with `run(input: AgentProviderRunInput)`.
- Provider implementations:
  - `CliAgentProvider` (codex/copilot) - CLI tools are already agentic
  - `LlmAgentProvider` (OpenAI-compatible: openai/groq/deepseek/qwen)
- `AgentProviderRouter` selects provider by:
  - per-command override (`payload.provider`)
  - per-role config override
  - global default (`AGENT_PROVIDER_DEFAULT`)

**CLI Provider Strategy:**
- CLI tools (codex/copilot) have internal agentic loops
- Provider builds clean instruction from userRequest + taskTitle + projectContext
- No prompt building - passes instruction directly to CLI
- Simple execution: spawn process, capture output

**LLM Provider Strategy:**
- LLM providers need external agentic wrapper
- Provider builds structured prompts using role-specific prompt sets
- Two-level loop system:
  1. **Iteration loop** (outer): Multi-turn task completion with continuation prompts
  2. **Tool loop** (inner): Bounded tool-calling cycle per iteration
- Manages conversation context across iterations
- Maps task type to appropriate prompts via `ROLE_PROMPTS`

## Non-CLI Tooling

For native providers, execution is tool-assisted:
- `BasicAgentToolbox` exposes: `read_file`, `write_file`, `search`, `delete_path`, `move_path`, `list_dir`, `run_shell`.
- `OpenAiAgentProvider` runs a bounded tool loop:
  1. model returns either tool JSON or final JSON
  2. runtime executes tool in workspace-scoped cwd
  3. tool result is fed back to model
  4. loop ends on `final` or max steps

Safety:
- file paths are constrained to workspace root
- shell command execution uses allowlisted prefixes
- unknown tools are rejected

## Prompt Organization

**Original Prompts** (preserved, unmodified):
Role-specific prompts under `project/modules/agents/prompts/`:
- `planning.ts` - Detailed planning guidance with tool restrictions
- `generate.ts` - Code generation requirements and workflow
- `verify.ts` - Verification strategy and result classification
- `review.ts` - Code review criteria and findings format
- `types.ts` - `RolePromptSet` interface (`system`, `requirement`)

**Prompt Mapping** (new convenience layer):
`project/modules/agents/agents/prompts/role-prompts.ts`:
- `ROLE_PROMPTS`: Maps `CommandType` to existing `RolePromptSet`
  - `PLAN` → `planningPrompts`
  - `GENERATE` → `generatePrompts`
  - `FIX` → `generatePrompts`
  - `VERIFY` → `verifyPrompts`
  - `REVIEW` → `reviewPrompts`
- Helper functions: `getSystemPrompt()`, `getRequirementPrompt()`
- **No prompt content changes** - only imports and mapping structure

**Usage:**
- CLI providers ignore prompts (pass clean instructions only)
- LLM providers use `ROLE_PROMPTS[taskType]` to build structured prompts
- Agents forward `payload.skillContext` to providers for optional context

Supported provider ids for role routing:
- `codex`
- `copilot`
- `openai`
- `groq`
- `deepseek`
- `qwen`

## Orchestration Transitions

- `SESSION_STARTED` -> dispatch `PLAN`
- `PLAN_COMPLETED` -> dispatch `GENERATE`
- `IMPLEMENT_COMPLETED` -> dispatch `VERIFY`
- `TEST_FAILED` -> dispatch `FIX`
- `TEST_PASSED` -> dispatch `REVIEW`
- `REVIEW_FAILED` -> dispatch `FIX`
- `REVIEW_COMPLETED` -> SCM publish + session complete

## Runtime Wiring

Runtime registers role agents and provider router, replacing the old skill/coder pair as primary workflow executors.

**Factory Setup** (`runtime/factories/agent-factories.ts`):
- Creates provider instances (CLI and LLM providers)
- Creates `AgentProviderRouter` with provider map
- Creates role agents with:
  - `defaultCwd`: workspace directory
  - `maxIterations`: iteration limit for LLM providers
  - No prompts parameter (removed)
- Registers agents in `AgentRegistry`

## Data Flow

```text
Command → RoleAgent.execute()
  ↓
  Extract task context (userRequest, projectContext, etc.)
  ↓
  Build AgentProviderRunInput
  ↓
  AgentProviderRouter.run(providerId, input)
  ↓
  ┌─────────────────────────────────────┐
  │ CliAgentProvider OR LlmAgentProvider│
  └─────────────────────────────────────┘
           ↓                    ↓
    [CLI Path]           [LLM Path]
           ↓                    ↓
  Format instruction   Build prompts from ROLE_PROMPTS
           ↓                    ↓
  Spawn CLI process    Iteration loop {
           ↓              Tool loop {
  Capture output           Call model
           ↓                Execute tools
           ↓              }
           ↓            }
           ↓                    ↓
  ╰──────AgentProviderRunResult──────╯
           ↓
  RoleAgent.decide(result)
           ↓
  Emit workflow event
```
