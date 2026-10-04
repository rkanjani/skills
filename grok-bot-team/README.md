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

Tell your agent:

> Install the `grok-bot-team` skill from https://github.com/rkanjani/skills.

It needs to:

1. Run the installer for this one skill. It copies the whole folder, not just `SKILL.md`.

   ```bash
   npx skills@latest add rkanjani/skills --skill grok-bot-team
   ```

   Add `-g` to install for every project on the machine instead of the current one, and `--agent claude-code` (or `codex`, `cursor`, ...) to pick the agent when it is not detected.

2. Confirm the skill is listed (add `-g` if you installed with `-g`).

   ```bash
   npx skills@latest list
   ```

3. Start a new session so the skill is discovered.

Grok Bot is not a target of the installer: copy this folder into its skills library, then invoke the skill in Grok Bot chat.

<details>
<summary><strong>Without the installer</strong></summary>

```bash
git clone --depth 1 https://github.com/rkanjani/skills.git /tmp/rkanjani-skills
```

```bash
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/grok-bot-team ~/.claude/skills/
```

Use `~/.codex/skills` for Codex, or a project's `.claude/skills/` to install for that project only.

</details>

## Update

```bash
npx skills@latest update grok-bot-team
```

## Use

```text
Use $grok-bot-team to set up this Grok Bot product team: Lead, Builder, Growth, a Team channel, and GitHub if it is missing.
```
