# capture-learnings

Turn concrete feedback from the current chat into a small set of durable, verified principles, written into the narrowest place they belong: a skill, project context, or local rules.

- Extract the correction, the failure, and the desired behavior without persisting the transcript.
- Synthesize related feedback into one principle instead of one rule per correction.
- Integrate into existing guidance: strengthen, replace, or delete rather than append.
- Verify with the relevant tests and skill validation, or record no change when the evidence is thin.

The agent-facing instructions are in [SKILL.md](./SKILL.md).

## Requirements

None. The skill is instructions only.

## Install

Tell your agent:

> Install the `capture-learnings` skill from https://github.com/rkanjani/skills.

It needs to:

1. Run the installer for this one skill. It copies the whole folder, not just `SKILL.md`.

   ```bash
   npx skills@latest add rkanjani/skills --skill capture-learnings
   ```

   Add `-g` to install for every project on the machine instead of the current one, and `--agent claude-code` (or `codex`, `cursor`, ...) to pick the agent when it is not detected.

2. Confirm the skill is listed (add `-g` if you installed with `-g`).

   ```bash
   npx skills@latest list
   ```

3. Start a new session so the skill is discovered.

<details>
<summary><strong>Without the installer</strong></summary>

```bash
git clone --depth 1 https://github.com/rkanjani/skills.git /tmp/rkanjani-skills
```

```bash
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/capture-learnings ~/.claude/skills/
```

Use `~/.codex/skills` for Codex, or a project's `.claude/skills/` to install for that project only.

</details>

## Update

```bash
npx skills@latest update capture-learnings
```

## Use

```text
Use $capture-learnings to turn feedback in this chat into safe, scoped improvements to skills and project guidance.
```

In Claude Code, `/capture-learnings` also works.
