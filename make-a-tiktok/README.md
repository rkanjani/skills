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

These steps are written for an agent to run. Install the whole folder, not just `SKILL.md`.

Fetch the collection:

```bash
git clone --depth 1 https://github.com/rkanjani/skills.git /tmp/rkanjani-skills
```

Copy the skill into the skills directory of the agent that will use it. Claude Code:

```bash
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/make-a-tiktok ~/.claude/skills/
```

Codex:

```bash
mkdir -p ~/.codex/skills && cp -R /tmp/rkanjani-skills/make-a-tiktok ~/.codex/skills/
```

For a single project rather than the whole machine, copy into that project's `.claude/skills/` instead.

No further setup: the first run checks its tools and installs the bundled `playwright-core` itself (`node scripts/studio.mjs doctor --fix` inside the installed folder does the same on demand).

Confirm `SKILL.md` exists in the installed folder, then start a new session so the skill is discovered.

## Update

Refresh the clone, then repeat the copy step; it overwrites the installed files with the latest version.

```bash
git -C /tmp/rkanjani-skills pull
```

If the clone is gone, run the install steps from the top.

## Use

```text
Use $make-a-tiktok to make the next video for this app's TikTok page.
```

In Claude Code, `/make-a-tiktok` also works.
