---
name: bootstrap-ai-repo
description: Bootstrap an existing repository for AI-assisted development. Use when the user wants a repo made AI-ready or agent-ready, wants AGENTS.md or CLAUDE.md written or audited, or wants a codebase set up so agents can change it and prove their work.
---

# Bootstrap an AI repo

The target is a repo where a **cold agent**, one that has never seen it, can make the most common change and prove it works without asking anyone. Three things get it there:

- **Loop**: one command that turns red or green.
- **Map**: an `AGENTS.md` that says what the repo is, where things live, and what must not break.
- **Hygiene**: nothing in git that shouldn't be, and a release that ships only what it should.

Interview the repo before the user. Everything the bootstrap adds is proven by running it.

## Workflow

1. **Inventory.** Run `python3 scripts/repo_inventory.py <repo>`, then read the README, manifests, CI workflows, and every instruction file it lists. Done when you can state the stack, how it runs, how it ships, and which agent instruction files already exist.
2. **Gather evidence.** Run `python3 scripts/session_evidence.py <repo>` to see what people asked for and corrected in past Claude Code and Codex sessions in this repo. Read the user's global instructions and their other repos' `AGENTS.md` for house style, and the fix and revert commits the inventory lists. Done when every rule and preference you plan to write has a source: a session, a commit, or a file. See [references/evidence.md](references/evidence.md).
3. **Ask only the gaps.** In one batch, ask what the evidence couldn't settle: product intent, areas that are off-limits, who releases. Skip this step when nothing is missing.
4. **Close the loop.** Pick or build one check command that runs every fast check the repo has. Find where changes concentrate (churn in the inventory, the asks in the evidence) and give that code tests; where it has none, add characterization tests that pin today's behavior. Done when the command passes from a clean checkout. See [references/feedback-loops.md](references/feedback-loops.md).
5. **Hold behavior fixed.** Reach a green baseline with formatting and dead-reference fixes only, each in its own commit. A bug the new tests expose becomes a pending test (`test.todo`, `xfail`, `#[ignore]`) and a finding in the hand-off, not a fix.
6. **Clean the repo.** Ignore dependencies, build output, secrets, signing keys, and per-machine agent state (`.claude/settings.local.json`, `.claude/worktrees/`). Untrack mistakes with `git rm --cached`, which keeps the files on disk. When the release is a manual step that ships the wrong files, make it a command. Done when the inventory's "shouldn't be" section is empty or every remaining entry is intentional.
7. **Write the map.** `AGENTS.md` at the root is the single source of truth. `CLAUDE.md` is a short pointer that ends in `@AGENTS.md`, so Claude Code loads it. Merge existing instruction files into it rather than overwriting them. Done when every path and command in it has been checked against the repo and no line is a placeholder or generic advice. See [references/agents-md.md](references/agents-md.md).
8. **Run it in CI.** Add one workflow that runs the same check command, with read-only permissions and actions pinned to commit SHAs. Done when the workflow parses and the command it runs passed locally. Required checks and branch protection are the owner's call: offer them.
9. **Cold read.** Spawn a fresh subagent with no context and only the repo path. Ask it what the repo does and how it runs; what to run before calling a change done; where it would make the most common change and what it would do first; what data or contracts it must preserve; how a release happens and who does the last step; and what was missing or confusing. Fix the map wherever it answered wrong or had to dig through code for an answer the map should hold. Done when it answers all of them from the map.
10. **Hand off.** Commit in reviewable pieces: hygiene, formatting, dead references, tooling and tests, docs. Report what changed, the bugs and risks the work exposed, what you couldn't verify, and the decisions left to the owner.

## Already bootstrapped

Audit instead of regenerating. Run the check command, verify every path and command `AGENTS.md` names, read the evidence since it last changed, and fix drift in place. Report "no change needed" when it all holds.

## Rules

- A line in `AGENTS.md` states something true about this repo, or a rule with its reason. Guidance any agent already follows is noise.
- Encode a recurring mistake as a check before writing it as prose.
- Evidence becomes principles. Transcript text, personal data and secrets stay out of the repo, and preferences that belong to the person go to their global instructions, with their agreement.
- Vendored code, product copy, and links the owner controls stay as they are.
- Ask before publishing, deploying, pushing to a protected branch, or changing repository settings.
