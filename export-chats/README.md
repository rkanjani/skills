# export-chats

Bootstrap a new project conversation with everything you've already discussed. Export every Claude Code and Codex conversation about one project into a single zip, then load its transcripts into a fresh chat, Claude project, or agent so it starts with the project's history, decisions, and your corrections.

- Find sessions in both agents by working directory, git remote, or project name, including worktrees.
- Dry-run the match so nothing from another project slips in.
- Write a readable Markdown transcript per session, without tool calls or injected harness context.
- Keep the raw session files, Claude Code subagent logs, tool outputs and images alongside.
- Add an `index.csv` of every session, oldest first.
- Hand off with how to seed the new conversation from the transcripts.

The agent-facing instructions are in [SKILL.md](./SKILL.md).

## Requirements

Python 3.9 or later and `zstd` on the PATH (Codex compresses its rollouts). Reads `~/.claude/projects` and `~/.codex` on the machine it runs on.

## Install

Tell your agent:

> Install the `export-chats` skill from https://github.com/rkanjani/skills.

It needs to:

1. Run the installer for this one skill. It installs the whole folder, not just `SKILL.md`, and needs Node 22.20 or later.

   ```bash
   npx skills@latest add https://github.com/rkanjani/skills --skill export-chats
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
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/export-chats ~/.claude/skills/
```

For Codex, copy into `~/.agents/skills` instead. To install for one project only, use its `.claude/skills/` or `.agents/skills/`. To update, run `git -C /tmp/rkanjani-skills pull` and copy again.

</details>

## Update

```bash
npx skills@latest update export-chats
```

## Use

```text
Use $export-chats to bootstrap a new conversation about this project from my past Claude Code and Codex chats.
```

Then upload `claude-code/transcripts/`, `codex/transcripts/`, and `index.csv` from the zip to the new conversation or Claude project. Leave `raw/` out; it is mostly tool output and can hold secrets.

In Claude Code, `/export-chats` also works.

The script also runs on its own:

```bash
python3 export-chats/scripts/export_chats.py --match my-app --out ~/Documents/my-app-chats.zip
```
