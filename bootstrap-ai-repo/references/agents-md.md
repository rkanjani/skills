# Writing AGENTS.md

## Sections

Use the ones the repo needs, in this order.

1. **What it is.** Two to four sentences: the product, who uses it, the main journey, and any rule that outranks the rest (a parity rule, a privacy promise). Say whether there is a build step or a backend.
2. **How it works.** Only when the main flow crosses files or processes: a numbered path through them, naming the real functions, messages, and queues.
3. **Where things live.** `path`: what it holds and when you'd touch it. Group related files; skip the obvious ones.
4. **Contracts to preserve.** Stored data shapes, API and message formats, invariants and limits, and what older data or clients must keep working.
5. **Commands.** Install, the check command (marked as the one to run before calling work done), tests alone, format, run locally, package. Exact and copy-pasteable.
6. **Making the common change.** The change the history shows most often, as steps that start with the test.
7. **Gotchas.** Each one is a fact plus its consequence, sourced from the evidence: what surprised past sessions, config that looks wrong but is intentional, values the owner controls.
8. **Releasing.** The steps, and which step stays with a person.
9. **Keeping this file true.** One line: when a change renames something this file names, update the file in the same change.

## Budget

- Small repo: 40 to 100 lines.
- Large repo: under about 200 lines, with deep dives in `docs/` behind a pointer that says when to read them ("Read `docs/ingest.md` before changing ingest").
- Monorepo: a nested `AGENTS.md` per package holds only what differs from the root.

## Style

- Write for a reader in the middle of a task who will search the file, not read it top to bottom.
- Name real files, functions, commands, and selectors, in code formatting.
- State the target behavior ("A site rule returns after saving") rather than a prohibition.
- Match the house style of the user's other repos: headings, length, tone, punctuation.
- Leave out what tools already enforce. Point at the formatter config instead of restating it.

## CLAUDE.md and other tools

`CLAUDE.md` is a pointer. A markdown link doesn't load the file; the `@` import does:

```markdown
# Claude Code

<One sentence on what AGENTS.md covers, or the repo's top rule>:

@AGENTS.md
```

Codex and most other agents read `AGENTS.md` directly. When a repo already has tool-specific rule files (`.cursor/rules/`, `.github/copilot-instructions.md`, `GEMINI.md`), move shared content into `AGENTS.md` and leave only the tool-specific parts behind, with a pointer back.

## Existing instruction files

Merge rather than overwrite. Keep what is still true, delete what you verified is stale, and list the removals in the hand-off so the owner can object.
