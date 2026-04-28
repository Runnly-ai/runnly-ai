---
id: demo-skill
name: Demo Skill
description: A simple skill that reads its own reference note and runs a local script.
tools:
  - read_file
  - list_dir
  - search
isolation: inline
---

# Demo Skill

Use this skill to test:

- skill discovery from `./.skills`
- markdown frontmatter parsing
- dependency-free skill execution
- local `script.js` loading
- skill-scoped tool access

The skill should read `reference.md` and run the `summarize_reference` script when executed.

