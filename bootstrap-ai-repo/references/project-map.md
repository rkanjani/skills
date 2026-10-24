# The project map

The map is the long-form companion to `AGENTS.md`: what the product is, where everything in the repo sits, and how it got to its current state. `AGENTS.md` tells an agent how to work; the map tells it what it is working on and why things are the way they are.

Write it to `docs/PROJECT.md`, or extend the repo's existing equivalent (`docs/spec.md`, `docs/architecture.md`, a long README) instead of starting a second one. `AGENTS.md` links to it with a line that says when to read it.

## Sections

1. **The product.** What it does and for whom, in the repo's own words where it has them (store listing, README, package description). Where it ships and under what name (store listing, URL, package name, platforms), the current version, and whether it is active, in maintenance, or dormant. How it makes money, if it does (paid, ads, affiliate links, donations), and what data it collects and where that data goes, including analytics that were removed.
2. **Repo map.** Every tracked top-level path, each labelled first-party, vendored, generated, build output, fixture, config, or docs, with one line on what it is. Then the entry points (what runs first for each surface) and how the pieces connect at runtime: a small text or Mermaid diagram of the processes, scripts, services, and the messages or calls between them, plus every external service the code talks to.
3. **How it got here.** A dated timeline of eras and milestones: the first version, rewrites, platform migrations, features added and removed, releases and version jumps, long pauses and what restarted the work. One line each, with the commit, tag, or pull request that marks it.
4. **Decisions.** Choices that still shape the code (framework, storage, architecture, distribution) and the reason for each when it is known.
5. **Removed and abandoned.** Files, dependencies, and features that used to exist, when they went, and why when known, so nobody brings one back without meaning to or goes looking for it.
6. **Debt and open threads.** Known bugs, including those the bootstrap's tests exposed; risky patterns; outdated dependencies; TODO markers; open issues and pull requests; anything half-done.

## Sources

- `scripts/repo_history.py <repo>`: span and pace, quiet stretches, tags, merged pull requests, version changes, when each top-level path appeared, what was removed, the largest commits, TODO markers, and open issues and pull requests.
- `scripts/repo_inventory.py <repo>`: the current layout and where changes concentrate.
- Pull request descriptions and review threads for the merges the history lists (`gh pr view <n>`), when they exist.
- The session evidence (see [evidence.md](evidence.md)) for decisions and intent that never reached a commit message.
- The code itself for the product facts: manifests, store metadata, hard-coded links, analytics calls, outbound requests.

## Rules

- Every dated claim cites a commit SHA, tag, or pull request number.
- Mark anything inferred as inferred, with what it was inferred from. Ask the owner when an inference would steer decisions (the product's status, why something was removed).
- The repo map is exhaustive at the top level: every tracked top-level path appears.
- Keep the timeline to milestones. Twenty commits that tweak one screen are one line.
- Contributors appear only as the repo already shows them, without emails.
- When the repo is public, check the map for anything the owner wouldn't publish (revenue, private URLs, account names) before committing it.

## Budget

80 to 200 lines for a small or medium repo. A large repo can split it into `docs/architecture.md` (the product, the map, decisions) and `docs/history.md` (how it got here, removed, debt), linked from `AGENTS.md`.
