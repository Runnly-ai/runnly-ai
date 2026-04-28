---
id: sample-inspect
name: Sample Inspect Skill
description: Demonstrates discovered skill loading, dependency-free execution, and scoped tool access.
tools:
  - read_file
  - search
  - list_dir
isolation: inline
---

# Sample Inspect Skill

Use this skill to inspect repository files and demonstrate how skills are discovered from a configured skill root.

This skill is intentionally small and portable. It is useful as a smoke test for:

- `AGENT_SKILLS_DIR`
- `SKILL.md` discovery
- frontmatter parsing
- skill-scoped tool availability

