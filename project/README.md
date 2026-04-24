# Runnly.AI MVP

This service is an event-driven workflow engine:

- Session lifecycle API
- Central orchestration from events
- Command queue for agent execution
- Stateless role-based agents (planning, generate, verify, review)
- Provider-agnostic execution (CLI tools and LLM providers)
- Pluggable backends for queue, event bus, and state

Architecture docs:
- `../docs/design.md` - Overall system architecture
- `../docs/agent-flow-design.md` - Agent and provider architecture
- `../docs/priciples.md` - Design principles

## Module Layout

Core domains and cross-cutting modules live under `project/modules/`:

- `session`, `task`, `command`, `event`, `orchestration`
- `agents`, `infra`, `providers`, `workspace`, `utils`

## Service Separation Boundaries

Role bootstrap is now split into dedicated service folders:

- `api/` (API service)
- `orchestrator/` (orchestration service)
- `worker/` (worker service)
- Shared bootstrap primitives in `runtime/bootstrap.ts`

This keeps service wiring independent so each role can be moved to a separate repo while still importing shared domain modules (for example `modules/session`, `modules/task`, `modules/event`, `modules/infra`).

Current process entrypoints:

- API process: `api/index.ts`
- Orchestrator process: `orchestrator/index.ts`
- Worker process: `worker/index.ts`

## Agent Architecture

**Separation of Concerns:** Agents prepare task context; providers handle execution strategy.

### Role-Based Agents

Four stateless role agents handle workflow stages:
- **PlanningRoleAgent** - Creates implementation plans
- **GenerateRoleAgent** - Generates/fixes code
- **VerifyRoleAgent** - Runs tests and verification
- **ReviewRoleAgent** - Reviews code quality

Agents extract task context (userRequest, projectContext, requirements) and delegate to providers via `AgentProviderRouter`.

### Provider Types

**CLI Providers** (`codex`, `copilot`):
- For CLI tools with built-in agentic capabilities
- Formats clean instructions without prompts
- Spawns CLI process and captures output
- No external loop needed (tools handle internally)

**LLM Providers** (`openai`, `groq`, `deepseek`, `qwen`):
- For LLM APIs requiring external agentic wrapper
- Builds structured prompts from role-specific prompt sets
- Implements two-level loop system:
  - **Iteration loop** (outer): Multi-turn task completion
  - **Tool loop** (inner): Bounded tool-calling per iteration
- Manages conversation context across iterations

### Prompt Organization

Original prompts preserved in `modules/agents/prompts/`:
- `planning.ts` - Planning guidance with tool restrictions
- `generate.ts` - Code generation workflow
- `verify.ts` - Verification strategy
- `review.ts` - Code review criteria

Mapping layer in `modules/agents/agents/prompts/role-prompts.ts` maps command types to appropriate prompts for LLM providers.

## API

- `POST /sessions` (`autoStart` optional)
- `POST /sessions/:id/start`
- `GET /sessions/:id`
- `GET /sessions/:id/events`
- `GET /sessions/:id/stream` (SSE live stream for one session)
- `GET /streams/events` (SSE live stream across sessions, optional filters)
- `GET /health`

## Architecture Diagram (Text)

```text
                        +----------------------+
                        |      Client/UI       |
                        +----------+-----------+
                                   |
                                   | HTTP
                                   v
                     +-------------+--------------+
                     |         API Process        |
                     |  SessionService            |
                     |  EventService              |
                     |  (optional) Orchestrator   |
                     |  (optional) Worker Runtime |
                     +------+------+--------------+
                            |      |
        publishes events ---+      +--- enqueues command ids
                            |      |
                            v      v
                 +----------+--+  +------------------+
                 | Event Bus   |  |  Command Queue   |
                 | memory/redis|  |   memory/redis   |
                 +------+------+  +---------+--------+
                        |                    |
                        | subscribe          | dequeue
                        v                    v
          +-------------+--------------------+-------------+
          |            Worker Process(es)                  |
          |  AgentRuntime -> AgentRegistry                 |
          |  Role Agents -> AgentProviderRouter            |
          |  -> CLI/LLM Providers                          |
          +-------------+--------------------+-------------+
                        |                    |
                        +---------+----------+
                                  |
                                  v
                        +---------+----------+
                        |   Shared State     |
                        | Session/Task/Event |
                        | Command Repos      |
                        | memory or Redis    |
                        +--------------------+
```

## Prerequisites

- Node.js 18+
- npm
- Redis (only for Redis-backed modes)

## Install and Build

From `project/`:

```bash
npm install
npm run build
```

Create/update env values in `.env` (a starter file is included).  
You can also copy from `env.example` if needed.

## CI/CD And IaC

The repo now includes a minimal GitHub Actions and Terraform setup for Azure:

- `.github/workflows/ci.yml` runs the Node build on pushes and pull requests.
- `.github/workflows/terraform.yml` runs `terraform init`, `validate`, and `plan` for `infra/terraform`.
- `infra/terraform/` contains the initial Azure infrastructure skeleton for the demo.

Current Terraform scope:

- resource group
- Azure Static Web App
- storage account placeholder
- Service Bus namespace
- Event Grid topic

Important:

- the Terraform workflow does **not** apply infrastructure yet
- the current TypeScript backend is **not** deployed by Terraform yet
- the current infra is a foundation for the demo, not a full production deployment

Local Terraform usage:

```bash
cd ../infra/terraform
terraform init
terraform validate
terraform plan \
  -var="project_name=yourname" \
  -var="github_repository=yourorg/yourrepo"
```

## Run Modes

### Full-stack Next.js (recommended)

Runs chat UI at `/` plus Next.js API endpoint at `/api/chat` in one process.

```bash
npm run dev
```

Frontend stack is selectable:
- `FRONTEND_STACK=next` (default)
- `FRONTEND_STACK=none` (skip frontend command)
- `FRONTEND_DIR=ui` (default frontend folder)
- `FRONTEND_PORT=3001` (default frontend port)

Production:

```bash
npm run build
npm run start
```

### Legacy Express API only

Use this if you need the original standalone Express service:

```bash
npm run dev:backend
```

Production:

```bash
npm run build:backend
npm run start:backend
```

## End-to-End Test

### A. UI-first end-to-end (recommended)

1. Create local env file:

```bash
cp env.example .env
```

2. Set minimum required env values in `.env`:

```env
RUN_WORKER=true
RUN_ORCHESTRATOR=true
DB_BACKEND=sqlite
SQLITE_DB_PATH=./data/runnly-ai.sqlite

# choose one provider family:
AGENT_PROVIDER_DEFAULT=groq
GROQ_API_KEY=your_key
```

3. Start app:

```bash
npm install
npm run dev
```

run redis:

```bash
C:\Redis\redis-server.exe
```

4. Open UI:

```text
http://localhost:3001
```

5. Run a prompt from the chat UI and verify workflow activity:
- check session state via `GET /sessions/:id`
- check event stream via `GET /sessions/:id/events`

### B. API-first end-to-end with SCM context

Use this when testing repository checkout/worktree/PR flow.

1. Start backend:

```bash
npm run dev:backend
```

2. Create session:

```bash
curl -X POST http://localhost:3000/sessions \
  -H "content-type: application/json" \
  -d "{
    \"goal\":\"Implement feature X\",
    \"context\":{
      \"scm\":{
        \"provider\":\"github\",
        \"repoUrl\":\"https://github.com/<org>/<repo>.git\",
        \"baseBranch\":\"main\",
        \"prTitle\":\"Agent changes for feature X\"
      }
    }
  }"
```

Optional one-call start:

```bash
curl -X POST http://localhost:3000/sessions \
  -H "content-type: application/json" \
  -d "{\"goal\":\"Implement feature X\",\"autoStart\":true,\"context\":{\"scm\":\"https://github.com/<org>/<repo>.git\"}}"
```

3. Start session (skip this step if you sent `"autoStart": true` in step 2):

```bash
curl -X POST http://localhost:3000/sessions/<sessionId>/start
```

4. Inspect progress:

```bash
curl http://localhost:3000/sessions/<sessionId>
curl http://localhost:3000/sessions/<sessionId>/events
```

### 1. Single-process local (memory backends)

```bash
npm run dev:backend
```

Defaults:
- `PORT=3000`
- `QUEUE_BACKEND=memory`
- `EVENT_BUS_BACKEND=memory`
- `STATE_BACKEND=memory`
- `RUN_WORKER=true`
- `RUN_ORCHESTRATOR=true`

### 2. Single-process local with Redis backends

```bash
QUEUE_BACKEND=redis EVENT_BUS_BACKEND=redis STATE_BACKEND=redis npm run dev:backend
```

### 3. Distributed topology (recommended for scale)

All nodes use:
- `QUEUE_BACKEND=redis`
- `EVENT_BUS_BACKEND=redis`
- `STATE_BACKEND=redis`
- same `REDIS_URL` and `REDIS_KEY_PREFIX`
- Do not use `memory` backends in multi-process mode.

Run API only:

```bash
npm run start:api
```

Run one orchestrator instance:

```bash
npm run start:orchestrator
```

Run one or more worker instances:

```bash
npm run start:worker
```

You can scale workers horizontally by starting multiple worker processes.

Development mode equivalents:

```bash
npm run dev:api
npm run dev:orchestrator
npm run dev:worker
```

## Environment Variables

- `PORT` (default `3000`)
- `WORKER_POLL_MS` (default `100`)
- `QUEUE_BACKEND` = `memory|redis` (default `memory`)
- `EVENT_BUS_BACKEND` = `memory|redis` (default `memory`)
- `STATE_BACKEND` = `memory|redis` (default `memory`)
- `REDIS_URL` (default `redis://127.0.0.1:6379`)
- `REDIS_KEY_PREFIX` (default `runnly-ai`)
- `REDIS_COMMAND_QUEUE_KEY` (default `runnly-ai:commands`)
- `REDIS_EVENT_CHANNEL` (default `runnly-ai:events`)
- `RUN_WORKER` (default `true`)
- `RUN_ORCHESTRATOR` (default `true`)
- `LOG_VERBOSE` (default `false`, master switch for all verbose logs)
- `LOG_WORKFLOW_PROGRESS` (default `false`, logs worker dequeue/execution and orchestration transitions)
- `LOG_AGENT_DEBUG` (default `false`, logs per-step agent/provider details including model output previews)
- `LOG_SESSION_TO_FILE` (default `true`, writes per-session logs to files under `SESSION_LOG_DIR`)
- `SESSION_LOG_DIR` (default `./.factory-work/logs/sessions`)
- `FACTORY_WORK_ROOT` (default `./.factory-work`, unified root for agent/scm runtime artifacts)
- `DB_BACKEND` = `sqlite|postgres` (default `sqlite`, used for persistent SCM binding storage)
- `SQLITE_DB_PATH` (default `./data/runnly-ai.sqlite`)
- `POSTGRES_URL` (required when `DB_BACKEND=postgres`)
- `AGENT_SKILLS_DIR` (optional path to custom `SKILL.md` directory)
- `AGENT_LLM_PROVIDER` = `none|openai` (default `none`, used by filesystem skills)
- `OPENAI_API_KEY` (required when using native OpenAI-compatible provider)
- `OPENAI_MODEL` (optional model override for skill execution)
- `OPENAI_BASE_URL` (optional OpenAI-compatible API base URL override; can target OpenAI-compatible endpoints)
- `GROQ_API_KEY` (optional key for Groq OpenAI-compatible endpoint)
- `GROQ_MODEL` (optional default model, default `llama-3.3-70b-versatile`)
- `GROQ_BASE_URL` (optional base URL override, default `https://api.groq.com/openai/v1`)
- `DEEPSEEK_API_KEY` (optional key for DeepSeek OpenAI-compatible endpoint)
- `DEEPSEEK_MODEL` (optional default model, default `deepseek-chat`)
- `DEEPSEEK_BASE_URL` (optional base URL override, default `https://api.deepseek.com`)
- `QWEN_API_KEY` (optional key for Qwen OpenAI-compatible endpoint)
- `QWEN_MODEL` (optional default model, default `qwen3-max`)
- `QWEN_BASE_URL` (optional base URL override, default `https://dashscope.aliyuncs.com/compatible-mode/v1`)
- `DOUBAO_API_KEY` (optional key for Doubao (Ark/Volcengine) OpenAI-compatible endpoint)
- `DOUBAO_MODEL` (optional default model, default `doubao-seed-2-0-code-preview-260215`)
- `OLLAMA_API_KEY` (optional API key for Ollama OpenAI-compatible endpoint, default `ollama`)
- `OLLAMA_MODEL` (optional default model, default `qwen3-vl:8b`)
- `OLLAMA_BASE_URL` (optional base URL override, default `http://localhost:11434/v1`)
- `AGENT_PROVIDER_DEFAULT` = `codex|copilot|openai|groq|deepseek|qwen|doubao|ollama` (default `codex`)
- `AGENT_PROVIDER_PLAN` (optional per-role provider override)
- `AGENT_PROVIDER_GENERATE` (optional per-role provider override)
- `AGENT_PROVIDER_VERIFY` (optional per-role provider override)
- `AGENT_PROVIDER_REVIEW` (optional per-role provider override)
- `AGENT_PROVIDER_INTAKE` = `openai|groq|deepseek|qwen|doubao|ollama` (optional, defaults to first configured LLM provider and then `ollama`)
- `AGENT_MODEL_DEFAULT` (optional global model override for plan/generate/verify/review/intake)
- `AGENT_MODEL_PLAN` (optional per-role model override)
- `AGENT_MODEL_GENERATE` (optional per-role model override)
- `AGENT_MODEL_VERIFY` (optional per-role model override)
- `AGENT_MODEL_REVIEW` (optional per-role model override)
- `AGENT_MODEL_INTAKE` (optional intake-agent model override)
- `AGENT_MAX_TOOL_STEPS` (default `3`, max tool-calling iterations per LLM provider run)

Model precedence:
- per-role model env (`AGENT_MODEL_*`) when set
- otherwise `AGENT_MODEL_DEFAULT` when set
- otherwise provider-specific defaults
- `CODER_CLI_PROVIDER` = `codex|copilot` (default `codex`)
- `CODEX_CLI_PATH` (default `codex`)
- `CODEX_CLI_BASE_ARGS` (default `exec`)
- `CODEX_MODEL` (optional)
- `COPILOT_CLI_PATH` (default `copilot`)
- `COPILOT_CLI_BASE_ARGS` (default `exec`)
- `COPILOT_MODEL` (optional)
- `SCM_GIT_PATH` (default `git`)
- `SCM_DEFAULT_BASE_BRANCH` (default `main`)
- `SCM_GIT_USER_NAME` (default `runnly-ai`)
- `SCM_GIT_USER_EMAIL` (default `runnly-ai@local`)
- `SCM_GITHUB_TOKEN` (optional default GitHub token for SCM operations)
- `SCM_AZURE_DEVOPS_TOKEN` (optional default Azure DevOps token for SCM operations)
- `SCM_GITHUB_WEBHOOK_SECRET` (optional secret for GitHub webhook signature verification)
- `SCM_AZURE_DEVOPS_WEBHOOK_SECRET` (optional secret for Azure DevOps webhook signature verification)

Derived runtime paths (not environment variables):
- `FACTORY_WORK_ROOT/agent-cwd` for agent working directory
- `FACTORY_WORK_ROOT/workspaces` for isolated runtime workspaces
- `FACTORY_WORK_ROOT/workspaces/<workspaceId>/sessions/<sessionId>/agent` for non-SCM agent execution cwd
- `FACTORY_WORK_ROOT/workspaces/<workspaceId>/sessions/<sessionId>/scm/{repo,worktree}` for SCM clone/worktree state

## Quick Smoke Test

1. Create session:

```bash
curl -X POST http://localhost:3000/sessions \
  -H "content-type: application/json" \
  -d "{\"goal\":\"Build MVP workflow\",\"autoStart\":true}"
```

2. Start session (only needed when `autoStart` is omitted or `false`):

```bash
curl -X POST http://localhost:3000/sessions/<sessionId>/start
```

3. Read session view:

```bash
curl http://localhost:3000/sessions/<sessionId>
```

4. Read event history:

```bash
curl http://localhost:3000/sessions/<sessionId>/events
```

### Role Agent Workflow

Session workflow follows a role loop:
- `plan` -> `generate` -> `verify` -> `review`
- `verify` failure -> `generate`
- `review` failure -> `generate`

Role prompts are maintained in:
- `modules/agents/prompts/planning.ts`
- `modules/agents/prompts/generate.ts`
- `modules/agents/prompts/verify.ts`
- `modules/agents/prompts/review.ts`

For non-CLI providers (e.g. native OpenAI), agents can use basic workspace tools:
- `read_file`, `write_file`, `search`, `delete_path`, `move_path`, `list_dir`, `run_shell`

Tooling constraints:
- file paths are restricted to the command working directory root
- shell commands are allowlisted by prefix for safety

Optional provider hint fields in command payload:
- `provider`: `codex|copilot|openai|groq|deepseek|qwen|doubao|ollama`
- `skillContext`: extra skill/procedure context injected into provider prompt

Command payload overrides accepted by role agents:
- `instruction`: explicit prompt text
- `systemPrompt`: explicit system prompt override
- `userPrompt`: explicit user prompt override
- `cwd`: execution working directory
- `model`: per-command model override
- `provider`: `codex|copilot|openai|groq|deepseek|qwen|doubao|ollama` per-command provider override
- `skillContext`: extra skill/procedure context injected into provider prompt

### Filesystem Skills (`SKILL.md`)

If `AGENT_SKILLS_DIR` is set, the runtime recursively discovers files named `SKILL.md`
and lazy-loads them as agent skills.

Supported frontmatter in `SKILL.md`:
- `id`: optional unique skill id
- `title` or `name`: short skill title (used for routing)
- `description`: short skill summary (used for routing)

Routing behavior:
- Skills are general procedure documents, not command-type-bound handlers.
- The router considers metadata only (`name/title` + `description`).
- LLM selects a skill based on \"when to use\" signal in description.
- Full `SKILL.md` content is loaded only after selection (lazy load).

To execute skill content with a native model, set:
- `AGENT_LLM_PROVIDER=openai`
- `OPENAI_API_KEY=<key>` (or `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `QWEN_API_KEY`, `OLLAMA_API_KEY` with matching provider selection)

Optional skill-local scripts:
- Add `script.js` (or `script.cjs`, `script.ts`) next to `SKILL.md`.
- Export `scripts` as a map of async functions.
- During execution, the model can return JSON:
  `{"script":"<name>","args":{}}`
- The runtime executes the named function and stores the script result in task output.

Example `SKILL.md`:

```md
---
id: product-plan
title: Product Planning
description: Create implementation plans from product requirements.
---
# Planning Skill

Create a concise implementation plan with:
1. Scope
2. Files to touch
3. Risks
4. Test checklist
```

Example `script.js` next to `SKILL.md`:

```js
exports.scripts = {
  create_branch: async ({ name }) => `git checkout -b ${name || 'feature/new-branch'}`,
};
```

### SCM Session Context (Orchestrator-owned)

When creating a session, you can provide SCM details in `context.scm` so orchestration
can checkout code, isolate a worktree for agent execution, and publish PRs:

```json
{
  "goal": "Implement feature X",
  "context": {
    "scm": {
      "provider": "github",
      "repoUrl": "https://github.com/org/repo.git",
      "baseBranch": "main",
      "token": "optional-token-override",
      "prTitle": "Agent changes for feature X"
    }
  }
}
```

Supported providers:
- `github`
- `azure-devops`

Minimal input is also supported. If only repo URL is provided, orchestration auto-detects
provider from URL and uses defaults for branch/title/message:

```json
{
  "goal": "Implement feature X",
  "context": {
    "scm": "https://github.com/org/repo.git"
  }
}
```

Equivalent shorthand forms:

```json
{
  "goal": "Implement feature X",
  "context": {
    "repoUrl": "https://dev.azure.com/org/project/_git/repo"
  }
}
```

### SCM Webhooks (Event-driven Feedback)

Webhook endpoints:
- `POST /webhooks/github`
- `POST /webhooks/azure-devops`

Orchestration behavior:
- On `SCM_PIPELINE_FAILED`: create fix task and dispatch `FIX`
- On `SCM_REVIEW_COMMENT_ADDED`: create fix task and dispatch `FIX`
- On `SCM_PIPELINE_PASSED`: no-op hook (reserved for future policy)

When a PR is created by the SCM module, the system stores a PR->session binding so webhook
events are correlated back to the correct session.

Persistence for PR->session binding uses the DB module:
- Local default: SQLite file at `SQLITE_DB_PATH`
- Production option: Postgres via `POSTGRES_URL`

Schema files:
- `modules/db/schema/sqlite.sql`
- `modules/db/schema/postgres.sql`

Backend build copies these SQL files into `dist/modules/db/schema` so runtime schema loading is file-based.

## Operational Notes

- Workers consume commands with a blocking queue dequeue loop.
- Orchestration is event-driven and subscribes to the event bus.
- With Redis pub/sub, multiple orchestrator instances will each receive the same event and may duplicate orchestration actions.
- Run exactly one orchestrator instance unless dedup/leader-election is added.

## Current Limits

- No durable event-consumer offsets or replayable event subscriptions yet (pub/sub only).
- No distributed lock for orchestration idempotency yet.
- No retry policy/dead-letter queue yet.


## The Whole Session Lifecycle


• 1. Client creates a session

  - POST /sessions with goal (and optional context like SCM repo URL, plus optional autoStart).
  - SessionService stores session as CREATED.

  2. Client starts session (explicit `POST /sessions/:id/start` or implicit via `autoStart=true`)

  - POST /sessions/:id/start
  - Session status becomes RUNNING.
  - Event emitted: SESSION_STARTED.

  3. Orchestrator handles SESSION_STARTED

  - If SCM config exists:
      - Detect provider (GitHub/Azure DevOps)
      - Clone repo
      - Create isolated worktree branch agent/<sessionId>
      - Save workspace metadata into session.context.scm.workspace
      - Emit SCM_WORKSPACE_PREPARED
  - Create PLAN task and dispatch `PLAN`.

  4. Worker runtime executes command queue

  - Runtime dequeues command id, resolves agent by capability, runs agent.
  - Agent updates task status/output and emits completion/failure events.

  5. Planning phase

  - Planning agent handles `PLAN`.
  - Marks PLAN task done.
  - Emits PLAN_COMPLETED.

  6. Implementation phase

  - Orchestrator handles PLAN_COMPLETED:
      - Creates IMPLEMENT task
      - Dispatches `GENERATE` with `cwd = worktreeDir` if SCM exists.
  - Coder agent runs implementation and emits IMPLEMENT_COMPLETED.

  7. Testing phase

  - Orchestrator handles IMPLEMENT_COMPLETED:
      - when all IMPLEMENT tasks are done, creates TEST task
      - dispatches `VERIFY`
  - Tester emits either:
      - TEST_PASSED, or
      - TEST_FAILED

  8. Fix loop (if tests fail)

  - On TEST_FAILED, orchestrator creates IMPLEMENT fix task and dispatches `FIX` (again with SCM worktree cwd).
  - After fix completes, flow returns to testing.

  9. Review phase

  - On TEST_PASSED, orchestrator creates REVIEW task and dispatches `REVIEW`.
  - Reviewer emits REVIEW_COMPLETED.

  10. SCM publish phase (on REVIEW_COMPLETED)

  - If SCM configured, orchestrator calls SCM service:
      - detect changes
      - commit/push branch
      - create PR
      - fetch pipeline failures + review comments (API pull)
  - Saves publish result in session.context.scm.publish.
  - Emits:
      - SCM_PR_CREATED or SCM_NO_CHANGES
      - SCM_FEEDBACK_SYNCED
  - Stores PR binding (provider, repo, prNumber) -> sessionId in DB.

  11. Session completion

  - Orchestrator sets session status COMPLETED.
  - Emits SESSION_COMPLETED.

  12. Webhook-driven continuation (event-driven SCM feedback)

  - POST /webhooks/github / POST /webhooks/azure-devops
  - Webhook service verifies signature, normalizes payload, resolves session via PR binding.
  - Emits internal events:
      - SCM_PIPELINE_FAILED
      - SCM_REVIEW_COMMENT_ADDED
      - SCM_PIPELINE_PASSED
  - Orchestrator reacts:
      - SCM_PIPELINE_FAILED -> create fix task + dispatch `FIX`
      - SCM_REVIEW_COMMENT_ADDED -> create fix task + dispatch `FIX`
      - SCM_PIPELINE_PASSED -> currently no-op hook
  - This lets a completed session re-enter RUNNING for follow-up fixes from real PR feedback.

  13. Persistence/backends in current design

  - Workflow entities (session/task/event/command): memory or Redis (existing STATE_BACKEND).
  - PR binding store: DB module (DB_BACKEND=sqlite|postgres, default sqlite).
  - SQLite/Postgres schema is applied on startup with CREATE TABLE IF NOT EXISTS (safe, no data wipe).
