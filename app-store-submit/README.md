# app-store-submit

Drive an iOS App Store release from repository inspection to a verified App Store Connect state.

- Inspect the Xcode release setup.
- Build and drive the app in iOS Simulator to capture real screenshots.
- Validate the icon and screenshots, then upload media and complete the listing.
- Submit for App Review only after explicit approval, then verify the final state.

The agent-facing instructions are in [SKILL.md](./SKILL.md).

## Requirements

macOS with Xcode and iOS Simulator, Python 3 for `scripts/validate_app_store_assets.py`, and access to the app's App Store Connect account.

## Install

These steps are written for an agent to run. Install the whole folder, not just `SKILL.md`.

Fetch the collection:

```bash
git clone --depth 1 https://github.com/rkanjani/skills.git /tmp/rkanjani-skills
```

Copy the skill into the skills directory of the agent that will use it. Claude Code:

```bash
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/app-store-submit ~/.claude/skills/
```

Codex:

```bash
mkdir -p ~/.codex/skills && cp -R /tmp/rkanjani-skills/app-store-submit ~/.codex/skills/
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
Use $app-store-submit to prepare this iOS app, capture and upload simulator screenshots, and report anything blocking review.
```

In Claude Code, `/app-store-submit` also works.
