# Skills

Practical agent skills for shipping real software.

Each skill is a self-contained workflow: focused instructions, reusable references, and deterministic scripts where reliability matters.

## Available skills

### `app-store-submit`

Prepare an iOS app for App Store Connect without losing track of release details.

- Inspect the Xcode release setup.
- Validate the App Store icon and iPhone screenshots.
- Plan screenshots around the product's real value.
- Upload media through App Store Connect.
- Complete listing and review prerequisites from verified app facts.
- Submit for App Review only after an explicit approval.
- Verify the final App Store Connect state.

[Explore `app-store-submit`](./app-store-submit/SKILL.md)

## Install

Clone the collection:

```bash
git clone https://github.com/rkanjani/Skills.git
```

Copy a skill into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills
cp -R Skills/app-store-submit ~/.codex/skills/
```

Restart Codex after installing, then invoke it directly:

```text
Use $app-store-submit to prepare this iOS app for App Store Connect.
```

## Design principles

- **Operational:** Each skill drives work to a verifiable outcome.
- **Safe:** Irreversible actions require explicit authorization.
- **Portable:** Examples use discovery and placeholders instead of project assumptions.
- **Lean:** Detailed material is loaded only when its workflow branch needs it.

## Acknowledgements

Some of the thinking behind this collection, including treating agent instructions as reusable, focused workflows, was inspired by [Matt Pocock's skills repository](https://github.com/mattpocock/skills). The skills published here are my own implementations; when a skill directly adapts third-party material, it will include specific attribution.

## License

[MIT](./LICENSE)
