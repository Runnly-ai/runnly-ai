# SCM Module Design

## Goals

Build a standalone SCM module (outside agents) that orchestration can use to:

1. Clone a repository by URL.
2. Create an isolated git worktree for agent execution.
3. Publish agent changes (commit + push branch + create PR).
4. Collect post-PR feedback signals:
   - failed pipeline/check information
   - review comments

Supported providers in this phase:
- GitHub
- Azure DevOps

## Placement

- New module: `project/modules/scm`
- New persistence module: `project/modules/db`
- Orchestration dependency injection:
  - `OrchestrationService` receives `scmService`.
  - SCM operations happen in orchestration event handlers, not in agent implementations.

## Session Context Contract

SCM input is provided in `session.context.scm`:

```json
{
  "provider": "github" | "azure-devops",
  "repoUrl": "https://...",
  "baseBranch": "main",
  "token": "optional-override-token",
  "commitMessage": "optional",
  "prTitle": "optional",
  "prDescription": "optional"
}
```

Runtime SCM state is written back to session context:

```json
{
  "workspace": {
    "rootDir": "...",
    "repoDir": "...",
    "worktreeDir": "...",
    "branch": "agent/<sessionId>",
    "baseBranch": "main"
  },
  "publish": {
    "pullRequest": { "id": "...", "number": 1, "url": "..." },
    "pipelineFailures": [],
    "reviewComments": [],
    "changed": true
  }
}
```

## Orchestration Lifecycle Integration

1. `SESSION_STARTED`
- If `session.context.scm` exists:
  - initialize provider client
  - clone repo
  - create isolated worktree branch
  - persist workspace metadata in session context
- Continue normal planning dispatch.

2. `PLAN_COMPLETED`
- Pass `worktreeDir` as `cwd` in `GENERATE` payload.

3. `REVIEW_COMPLETED`
- If SCM workspace exists:
  - detect local changes
  - commit and push branch
  - create pull request
  - query failed pipeline/check signals
  - query review comments
  - persist publish result in session context

## Abstractions

### `ScmProvider`
Provider-specific API abstraction:
- parse repository identifiers from URL
- produce authenticated clone/push URL
- create pull request
- list failed pipeline/check signals
- list review comments

### `ScmService`
Orchestration-facing application service:
- `prepareWorkspace(...)`
- `publishAndCollectFeedback(...)`

### `PullRequestBindingRepo`
Persistence for webhook correlation:
- key: provider + repository + pr number
- value: session id
- implementations:
  - sqlite (default local)
  - postgres
- schema source:
  - file-based SQL under `project/modules/db/schema/*.sql`
  - backend build copies schema files into `dist/modules/db/schema`

### `GitClient`
Minimal wrapper around `git` CLI for:
- clone/fetch/worktree add
- status/add/commit/push

## Notes

- This design keeps provider APIs isolated from orchestration logic.
- Worktrees are session-scoped for isolation.
- Commit uses configured identity (`SCM_GIT_USER_NAME` / `SCM_GIT_USER_EMAIL`).
- Tokens can come from session context or env defaults per provider.
- Webhook ingestion is supported via:
  - `POST /webhooks/github`
  - `POST /webhooks/azure-devops`
- Webhook payloads are normalized into internal events:
  - `SCM_PIPELINE_FAILED`
  - `SCM_REVIEW_COMMENT_ADDED`
  - `SCM_PIPELINE_PASSED`
