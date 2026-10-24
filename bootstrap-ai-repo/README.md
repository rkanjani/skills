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

These steps are written for an agent to run. Install the whole folder, not just `SKILL.md`.

Fetch the collection:

```bash
git clone --depth 1 https://github.com/rkanjani/skills.git /tmp/rkanjani-skills
```

Copy the skill into the skills directory of the agent that will use it. Claude Code:

```bash
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/bootstrap-ai-repo ~/.claude/skills/
```

Codex:

```bash
mkdir -p ~/.codex/skills && cp -R /tmp/rkanjani-skills/bootstrap-ai-repo ~/.codex/skills/
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
Use $bootstrap-ai-repo to get this repository ready for AI development.
```

In Claude Code, `/bootstrap-ai-repo` also works. Run it again on a repo it already set up to audit the guidance for drift.
