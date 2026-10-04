# make-a-tiktok

Run a short-form content engine for any app: each run ships one new motion-graphics TikTok, Reel, or Short that is unlike every video made before it.

- Build or reuse the app's brand profile: real screens, looks, formats, and a sonic logo.
- Vary idea, structure, look, and sound against the studio ledger; a checker enforces it.
- Animate in code, render frames in headless Chrome with motion blur, and critique them in scored rounds.
- Export 9:16 and 4:5 deliverables with a per-video sound kit; publishing stays with the user.

The agent-facing instructions are in [SKILL.md](./SKILL.md).

## Requirements

Node 18+, ffmpeg, and Google Chrome.

## Install

Tell your agent:

> Install the `make-a-tiktok` skill from https://github.com/rkanjani/skills.

It needs to:

1. Run the installer for this one skill. It copies the whole folder, not just `SKILL.md`.

   ```bash
   npx skills@latest add rkanjani/skills --skill make-a-tiktok
   ```

   Add `-g` to install for every project on the machine instead of the current one, and `--agent claude-code` (or `codex`, `cursor`, ...) to pick the agent when it is not detected.

2. Confirm the skill is listed (add `-g` if you installed with `-g`).

   ```bash
   npx skills@latest list
   ```

3. Start a new session so the skill is discovered.

No further setup: the first run checks its tools and installs the bundled `playwright-core` itself.

<details>
<summary><strong>Without the installer</strong></summary>

```bash
git clone --depth 1 https://github.com/rkanjani/skills.git /tmp/rkanjani-skills
```

```bash
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/make-a-tiktok ~/.claude/skills/
```

Use `~/.codex/skills` for Codex, or a project's `.claude/skills/` to install for that project only.

</details>

## Update

```bash
npx skills@latest update make-a-tiktok
```

## Use

```text
Use $make-a-tiktok to make the next video for this app's TikTok page.
```

In Claude Code, `/make-a-tiktok` also works.
