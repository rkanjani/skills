# Feedback loops

## The check command

One entry point, named the way the repo names things already (`npm run check`, `make check`, `just check`, `./scripts/check`). It runs the format check, lint, type check, tests, and a structural check where nothing else catches broken wiring. It finishes in a couple of minutes on a laptop. Slow suites (end-to-end, on-device) stay separate commands, named in `AGENTS.md`.

Use what exists before adding anything:

| Stack | Usual parts of the check |
| --- | --- |
| JavaScript, TypeScript | the package's `format:check`, `lint`, `typecheck` and `test` scripts; `node --test` when there is no runner |
| Python | `ruff format --check`, `ruff check`, `mypy` or `pyright`, `pytest -q` |
| Rust | `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` |
| Go | `test -z "$(gofmt -l .)"`, `go vet ./...`, `go test ./...` |
| Swift | `swift test`, or `xcodebuild test` with an explicit simulator destination |
| Kotlin, Android | `./gradlew test lint` |
| No build step (static site, browser extension, scripts) | a reference checker: every file a manifest, page or script points at exists, and every script parses |

Add a tool only when the repo has none for that job, choose the ecosystem's default, and pin it exactly.

## Characterization tests

For code that changes often and has no tests:

- Drive it through its real entry point (the message, request, command or exported function a caller uses) and stub the platform only at the boundary.
- Use fixtures shaped like real input (a saved page, a recorded response, a sample file), trimmed to what matters, in a fixtures folder beside the tests.
- Assert today's output even when it looks odd, and name each test for the path it pins.
- When today's behavior is a bug, write the correct expectation as a pending test and report it.
- One test per distinct path through the code, not one per input.

## Green baseline

- Running the repo's own formatter over everything is fine as a commit with nothing else in it.
- A dead reference (a file that doesn't exist, a glob that matches nothing) can go when removing it changes nothing at runtime. Say so in the commit message.
- Anything else that is red stays visible: pending, or listed as known. A check is never weakened to pass.

## CI

- Trigger on pull requests, pushes to the default branch, and `workflow_dispatch`.
- `permissions: contents: read` unless a job needs more, and `persist-credentials: false` on checkout.
- Pin every action to a full commit SHA with a `# vX.Y.Z` comment. Look the SHA up (`gh api repos/<owner>/<action>/git/ref/tags/<tag>`) and choose a release at least two weeks old.
- Run exactly the local check command, under one stable job name so it can become a required status check.
- For a solo maintainer, branch protection means a required pull request with zero approvals plus the required check. Offer it; it is a repository setting.

## Release command

When shipping is a manual step, make the artifact reproducible: a script that runs the check, then builds exactly what ships (runtime files only, a versioned name) from the working tree. Uploading or publishing stays with the owner.
