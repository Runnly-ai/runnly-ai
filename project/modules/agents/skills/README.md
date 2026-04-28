# Agent Skills

This module implements the project’s skill system: portable markdown-based behavior bundles that an agent can discover, match, and execute.

## Design goals

- Keep the skill format portable across systems.
- Treat skills as declarative capability packages, not hardcoded agent branches.
- Separate discovery, parsing, matching, registry, and execution.
- Support our runtime model: task/service updates, stdout-style outputs, and agent context.
- Preserve compatibility with `SKILL.md` files that use YAML frontmatter.

## File format

A skill is a markdown file with frontmatter at the top and instructions below it.

Example:

```md
---
id: code-review
name: Code Review
description: Review code for correctness, style, and risk.
tools:
  - read_file
  - search
  - git_diff
isolation: inline
---

# Code Review

Use this skill when reviewing code changes...
```

Supported frontmatter:

- `id`
- `name`
- `title`
- `description`
- `tools`
- `disallowedTools`
- `skills`
- `model`
- `memory`
- `hooks`
- `isolation`

## Runtime architecture

### 1. Discovery

`loader.ts` scans configured skill directories recursively and finds files named `SKILL.md` or `skill.md`.

### 2. Parsing

`parser.ts` extracts YAML-style frontmatter and the markdown body.

### 3. Registry

`skill-registry.ts` stores lightweight manifests and loads skills lazily.
It also resolves `skills: [...]` dependencies into an ordered chain.

### 4. Matching

`matcher.ts` does fast local matching from metadata and explicit overrides.

### 5. Prompting

`prompt.ts` builds a compact skill-catalog prompt when LLM routing is needed.
It also builds an execution prompt that includes the resolved dependency chain and tool policy.

### 6. Execution

`markdown-skill.ts` loads the full markdown document, optionally loads local scripts, and produces a task result.
Skills are executed as part of the normal agent runtime, not through a separate routed skill agent.

## Execution modes

- `inline`: use the skill in the current agent flow.
- `subagent`: reserved for future isolated execution, not currently routed separately.

The current implementation supports the format and routing contract. Subagent execution can be added without changing the file format.

## Skills with scripts

Skills may include optional local scripts next to the markdown file:

- `script.js`
- `script.cjs`
- `script.ts`

The skill may request a script call by returning JSON:

```json
{"script":"name","args":{}}
```

The runtime executes the function map exported by the script file and stores the result in task output.

Example `script.js`:

```js
exports.scripts = {
  inspect_files: async ({ path }, context) => {
    const toolNames = context.toolExecutor?.listTools().map((tool) => tool.name) || [];
    return {
      requestedPath: path,
      availableTools: toolNames,
    };
  },
};
```

In a skill script, `context.toolExecutor` is the skill-scoped executor. It only exposes the tools
allowed by the skill policy, and rejects calls outside that set.

## How this fits the agent system

- The normal agent runtime loads skills from the configured root.
- The agent registry / provider flow can summarize available skills into context.
- The skill registry chooses a compatible skill from metadata.
- The skill executes using `AgentContext`, `Command`, and optional `LlmClient`.
- The result is written back through task and event services.

## Configured skill roots

Point `AGENT_SKILLS_DIR` at one or more directories to enable filesystem discovery:

```env
AGENT_SKILLS_DIR=./.skills
```

The loader recursively scans each configured root and discovers:

- `SKILL.md`
- `skill.md`

The repository includes a sample skill at:

- [`project/.skills/sample-inspect/SKILL.md`](../../../.skills/sample-inspect/SKILL.md)
- [`project/.skills/demo-skill/SKILL.md`](../../../.skills/demo-skill/SKILL.md)

Use it as a smoke test for discovery, frontmatter parsing, and tool-policy enforcement.

The `demo-skill` folder also includes:

- [`reference.md`](../../../.skills/demo-skill/reference.md)
- [`script.js`](../../../.skills/demo-skill/script.js)

The script exports a `summarize_reference` function that reports the visible tool set.

## Tool policy

When a skill declares `tools` or `disallowedTools`, the runtime intersects that declaration with the
project tool catalog. This keeps portable skills from requesting tools that the current runtime
does not expose.

The runtime can also provide a skill-scoped tool executor. That wrapper exposes only the filtered
tool list and rejects any attempted call outside the skill’s allowed set.

## Dependency chaining

A skill may declare `skills: [...]` to compose other skills. The registry resolves that list into an
ordered chain, and the execution prompt includes the full chain so the model can follow it in order.

This keeps the system aligned with the reference project’s skill architecture while remaining native to our runtime.
