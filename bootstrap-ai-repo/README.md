# bootstrap-ai-repo

Get an existing repository ready for AI-assisted development, so an agent that has never seen it can make the common change and prove it works.

- Inventory the repo: stack, commands, CI, existing agent instructions, tracked files that shouldn't be, and where changes concentrate.
- Read past Claude Code and Codex sessions in the repo for what people asked for and corrected, and turn them into rules.
- Build one check command, and add characterization tests where changes concentrate, without changing behavior.
- Clean up what git shouldn't hold and make the release a command when it's manual.
- Write `AGENTS.md` as the single source of truth, with a `CLAUDE.md` that imports it.
- Run the same check in CI with pinned actions.
- Prove the result with a cold read by a fresh agent, then hand off in reviewable commits.

The agent-facing instructions are in [SKILL.md](./SKILL.md).

## Requirements

Git and Python 3.9 or later for the scripts in `scripts/`. `zstd` is optional and lets the session reader open compressed Codex archives.

## Install

Tell your agent:

> Install the `bootstrap-ai-repo` skill from https://github.com/rkanjani/skills.

It needs to:

1. Run the installer for this one skill. It installs the whole folder, not just `SKILL.md`, and needs Node 22.20 or later.

   ```bash
   npx skills@latest add https://github.com/rkanjani/skills --skill bootstrap-ai-repo
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
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/bootstrap-ai-repo ~/.claude/skills/
```

For Codex, copy into `~/.agents/skills` instead. To install for one project only, use its `.claude/skills/` or `.agents/skills/`. To update, run `git -C /tmp/rkanjani-skills pull` and copy again.

</details>

## Update

```bash
npx skills@latest update bootstrap-ai-repo
```

## Use

```text
Use $bootstrap-ai-repo to get this repository ready for AI development.
```

In Claude Code, `/bootstrap-ai-repo` also works. Run it again on a repo it already set up to audit the guidance for drift.
