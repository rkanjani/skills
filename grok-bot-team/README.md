# grok-bot-team

Set up a Grok Bot product team: Lead, scalable Builders, Growth, a shared Team channel, and GitHub if it is missing. Inspects first and reuses what already matches.

- Confirm the operating model and get authorization before creating anything.
- Inspect existing teammates, group chats, and GitHub; reuse matches.
- Create only the missing roles and the Team channel.
- Record standing spawn rules and verify the end state.

The agent-facing instructions are in [SKILL.md](./SKILL.md).

## Requirements

A Grok Bot account. The skill runs inside Grok Bot chat, invoked with `/` or `@`; installing the files elsewhere does not run it.

## Install

These steps are written for an agent to run. Install the whole folder, not just `SKILL.md`.

Fetch the collection:

```bash
git clone --depth 1 https://github.com/rkanjani/skills.git /tmp/rkanjani-skills
```

Copy the skill into the skills directory of the agent that will use it. Claude Code:

```bash
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/grok-bot-team ~/.claude/skills/
```

Codex:

```bash
mkdir -p ~/.codex/skills && cp -R /tmp/rkanjani-skills/grok-bot-team ~/.codex/skills/
```

For a single project rather than the whole machine, copy into that project's `.claude/skills/` instead.

For Grok Bot, copy the same folder into its skills library instead of the directories above.

Confirm `SKILL.md` exists in the installed folder, then start a new session so the skill is discovered.

## Update

Refresh the clone, then repeat the copy step; it overwrites the installed files with the latest version.

```bash
git -C /tmp/rkanjani-skills pull
```

If the clone is gone, run the install steps from the top.

## Use

```text
Use $grok-bot-team to set up this Grok Bot product team: Lead, Builder, Growth, a Team channel, and GitHub if it is missing.
```
