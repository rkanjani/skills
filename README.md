# skills

Practical agent skills that end up driving how I work.

Each skill is meant to be installed by an agent. Make your life easier and just point your agent to the repo. Every skill folder has its own `README.md` with install steps an agent can follow.

## Available skills

### `app-store-submit`

Prepare an iOS app for App Store Connect without losing track of release details.

- Inspect the Xcode release setup.
- Validate the App Store icon and iPhone screenshots.
- Build and drive the app in iOS Simulator to capture real product screenshots.
- Upload media through App Store Connect.
- Complete listing and review prerequisites from verified app facts.
- Submit for App Review only after an explicit approval.
- Verify the final App Store Connect state.

[Explore `app-store-submit`](./app-store-submit/SKILL.md)

### `capture-learnings`

Turn feedback from a chat into durable guidance instead of a growing list of patches.

- Extract the correction, the failure, and the desired behavior without persisting the transcript.
- Synthesize related feedback into one principle rather than one rule per correction.
- Pick the narrowest target: a skill, project context, or local rules.
- Integrate into existing guidance: strengthen, replace, or delete rather than append.
- Verify with tests and skill validation, or record no change when the evidence is thin.

[Explore `capture-learnings`](./capture-learnings/SKILL.md)

### `grok-bot-team`

Set up a Grok Bot product team without duplicating roles that already match the model.

- Confirm the Lead / Builder / Growth / Team operating model and get authorization before creating anything.
- Inspect existing teammates, group chats, and GitHub; reuse matches.
- Create missing Lead, Builder, and Growth agents only.
- Create a Team channel seating those roles.
- Connect GitHub if it is missing.
- Record standing spawn rules; extra Builders and temporary specialists are created later only when work needs them.
- Verify the end state.

This skill runs in Grok Bot chat with `/` or `@`. Publishing it on GitHub does not execute it.

[Explore `grok-bot-team`](./grok-bot-team/SKILL.md)

### `make-a-tiktok`

Run a short-form content engine for any app: every run ships one new motion-graphics TikTok, Reel, or Short that is unlike everything made before it, for this app or any other.

- Build a brand profile from the app's code or website: tokens, fonts, logo, features, personas, voice, real product screens, the app's own looks and formats, and a sonic logo.
- Read every previous script and vary the idea, opening, format, register, look, camera, sound, and ending; a checker enforces structure, blocks, look, and sound against the ledger and against videos made for your other apps.
- Design a sound kit per video: twelve instrument families, a key, a groove, and seven arrangement shapes, with the rendered soundtrack measured against earlier ones. Or cut to a track you supply.
- Keep every video readable: under 45 seconds, one idea per scene, a checked reading budget.
- Animate in code, render frames in headless Chrome with motion blur, and critique the frames in scored rounds before the final render.
- Export 9:16 and 4:5 at 60 fps and -14 LUFS, with covers, a contact sheet, phone-size frames, and an SFX-only cut for trending sounds.
- Grow a library of reusable building blocks so each video is faster to make than the last.
- Prepare the caption and post notes; publishing stays with you.

Needs Node 18+, ffmpeg, and Google Chrome. The first run installs the renderer's dependency itself.

[Explore `make-a-tiktok`](./make-a-tiktok/SKILL.md)

## Install

Tell your agent:

> Install the skills from https://github.com/rkanjani/skills.

Or run the installer yourself and pick the skills and agents you want:

```bash
npx skills@latest add rkanjani/skills
```

For a single skill:

```bash
npx skills@latest add rkanjani/skills --skill capture-learnings
```

Each skill's `README.md` has its own requirements and a manual install path. Start a new session after installing, then invoke a skill directly:

```text
Use $app-store-submit to prepare this iOS app for App Store Connect.
```

```text
Use $capture-learnings to turn feedback in this chat into scoped improvements.
```

`grok-bot-team` runs in Grok Bot chat: copy its folder into the Grok Bot skills library and invoke it with `/` or `@`.

## Design principles

- **Operational:** Each skill drives work to a verifiable outcome.
- **Human in the loop:** Irreversible actions require explicit authorization.
- **Lean:** As concise as possible, to keep your tokens for building :)

  
## Acknowledgements

Inspired by [Matt Pocock's skills repository](https://github.com/mattpocock/skills) and my friends who encouraged my to start publishing my skills. The skills published here are my own implementations, but sometimes I'm inspired by some great minds, who I'll always source and attribute my work to.

## License

[MIT](./LICENSE)
