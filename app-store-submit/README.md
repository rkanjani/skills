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

Tell your agent:

> Install the `app-store-submit` skill from https://github.com/rkanjani/skills.

It needs to:

1. Run the installer for this one skill. It copies the whole folder, not just `SKILL.md`.

   ```bash
   npx skills@latest add rkanjani/skills --skill app-store-submit
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
mkdir -p ~/.claude/skills && cp -R /tmp/rkanjani-skills/app-store-submit ~/.claude/skills/
```

Use `~/.codex/skills` for Codex, or a project's `.claude/skills/` to install for that project only.

</details>

## Update

```bash
npx skills@latest update app-store-submit
```

## Use

```text
Use $app-store-submit to prepare this iOS app, capture and upload simulator screenshots, and report anything blocking review.
```

In Claude Code, `/app-store-submit` also works.
