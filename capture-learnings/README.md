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

These steps are written for an agent to run. Install the whole folder, not just `SKILL.md`.

Fetch the collection:

```bash
git clone --depth 1 https://github.com/rkanjani/skills.git /tmp/rkanjani-skills
```

Copy the skill into the skills directory of the agent that will use it. Claude Code:

```bash
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/capture-learnings ~/.claude/skills/
```

Codex:

```bash
mkdir -p ~/.codex/skills && cp -R /tmp/rkanjani-skills/capture-learnings ~/.codex/skills/
```

For a single project rather than the whole machine, copy into that project's `.claude/skills/` instead.

Confirm `SKILL.md` exists in the installed folder, then start a new session so the skill is discovered.

## Update

Refresh the clone, then repeat the copy step; it overwrites the installed files with the latest version.

```bash
git -C /tmp/rkanjani-skills pull
```

If the clone is gone, run the install steps from the top.

## Use

```text
Use $capture-learnings to turn feedback in this chat into safe, scoped improvements to skills and project guidance.
```

In Claude Code, `/capture-learnings` also works.
