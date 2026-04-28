# Agents Tools Module

This folder contains the shared tool layer used by agent providers.

## Purpose

- Centralize tool definitions and metadata
- Separate policy from execution
- Keep file, git, shell, and discovery helpers isolated
- Provide a stable surface for agent tool selection

## Design Philosophy

- Prefer small, named tools over one oversized shell interface
- Make tool intent explicit so agents and policy can reason about it
- Treat safety as layered, not single-check
- Keep the prompt-facing tool list aligned with runtime enforcement
- Optimize for agent progress without giving up workspace boundaries
- Preserve room to grow into richer command semantics later

This module is intentionally structured more like a policy engine than a raw utility bag. The agent sees a curated tool catalog, while execution stays behind a narrow dispatch layer.

## Structure

- `types.ts` - shared tool types and context
- `registry.ts` - tool catalog and tool metadata
- `policy.ts` - readonly filtering and shell safety checks
- `executor.ts` - main tool dispatch entrypoint
- `file.ts` - workspace file, glob, and search helpers
- `git.ts` - git inspection helpers
- `shell.ts` - allowlisted shell execution
- `tool-search.ts` - search across available tools
- `TODO.md` - deferred follow-up work

## Current Tool Set

- `read_file`
- `write_file`
- `edit_file`
- `search`
- `glob`
- `list_dir`
- `git_status`
- `git_diff`
- `run_shell`
- `pwd`
- `file_size`
- `tool_search`
- `delete_path`
- `move_path`

## Notes

- `ReadonlyAgentToolbox` uses the same executor layer but exposes only safe read tools.
- `run_shell` is still policy-gated and should remain tightly controlled.
- `agent_delegate` is intentionally deferred and tracked in `TODO.md`.

## Architecture

1. `registry.ts` defines the available tool surface.
2. `policy.ts` decides which tools or commands are admissible in a given context.
3. `executor.ts` dispatches the selected tool to the right helper.
4. Helper modules like `file.ts`, `git.ts`, `shell.ts`, and `tool-search.ts` keep the logic focused.
5. Provider code consumes only the public executor interface, not the implementation details.

That separation is deliberate:

- the registry keeps prompt/tool metadata stable
- the policy layer can evolve without changing execution call sites
- helpers stay testable in isolation
- the agent gets a consistent interface even as internals grow
