# skills

Practical agent skills that end up driving how I work.

Each skill is meant to be installed by an agent. Make your life easier and just point your agent to the repo.

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

Run a short-form content engine for any app: every run ships one new motion-graphics TikTok, Reel, or Short that varies from everything posted before.

- Build a brand profile from the app's code or website: tokens, fonts, logo, features, personas, voice.
- Read every previous script and vary the hook, format, feature, world, camera, music, and ending.
- Keep every video readable: under 45 seconds, one idea per scene, a checked reading budget.
- Animate in code, render frames in headless Chrome with motion blur, and score it with a synthesized soundtrack.
- Export 9:16 and 4:5 at 60 fps and -14 LUFS, with covers and an SFX-only cut for trending sounds.
- Grow a library of reusable building blocks so each video is faster to make than the last.
- Prepare the caption and post notes; publishing stays with you.

Needs Node 18+, ffmpeg, and Google Chrome. Run `npm install` inside the installed skill folder once.

[Explore `make-a-tiktok`](./make-a-tiktok/SKILL.md)

## Install

Clone the collection:

```bash
git clone https://github.com/rkanjani/skills.git
```

Copy a skill into your Codex skills directory (Grok Bot uses the same copy pattern into its skills library):

```bash
mkdir -p ~/.codex/skills
cp -R skills/app-store-submit ~/.codex/skills/
cp -R skills/grok-bot-team ~/.codex/skills/
cp -R skills/make-a-tiktok ~/.codex/skills/
```

Restart Codex after installing, then invoke it directly:

```text
Use $app-store-submit to prepare this iOS app for App Store Connect.
```

```text
Use $grok-bot-team to set up this Grok Bot product team.
```

## Design principles

- **Operational:** Each skill drives work to a verifiable outcome.
- **Human in the loop:** Irreversible actions require explicit authorization.
- **Lean:** As concise as possible, to keep your tokens for building :)

  
## Acknowledgements

Inspired by [Matt Pocock's skills repository](https://github.com/mattpocock/skills) and my friends who encouraged my to start publishing my skills. The skills published here are my own implementations, but sometimes I'm inspired by some great minds, who I'll always source and attribute my work to.

## License

[MIT](./LICENSE)
