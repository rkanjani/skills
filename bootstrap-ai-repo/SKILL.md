---
name: bootstrap-ai-repo
description: Bootstrap an existing repository for AI-assisted development. Use when the user wants a repo made AI-ready or agent-ready, wants AGENTS.md or CLAUDE.md written or audited, wants a codebase mapped and its history written down for agents, or wants a codebase set up so agents can change it and prove their work.
---

# Bootstrap an AI repo

The target is a repo where a **cold agent**, one that has never seen it, can make the most common change and prove it works without asking anyone. Four things get it there:

- **Loop**: one command that turns red or green.
- **Guide**: an `AGENTS.md` that says how to work here: commands, where things live, and what must not break.
- **Map**: a `docs/PROJECT.md` that says what the product is, where every part of the repo sits, and how development got here.
- **Hygiene**: nothing in git that shouldn't be, and a release that ships only what it should.

Interview the repo before the user. Everything the bootstrap adds is proven by running it.

## Workflow

1. **Inventory.** Run `python3 scripts/repo_inventory.py <repo>`, then read the README, manifests, CI workflows, and every instruction file it lists. Done when you can state the stack, how it runs, how it ships, and which agent instruction files already exist.
2. **Gather evidence.** Run `python3 scripts/session_evidence.py <repo>` to see what people asked for and corrected in past Claude Code and Codex sessions in this repo. Read the user's global instructions and their other repos' `AGENTS.md` for house style, and the fix and revert commits the inventory lists. Done when every rule and preference you plan to write has a source: a session, a commit, or a file. See [references/evidence.md](references/evidence.md).
3. **Map it.** Run `python3 scripts/repo_history.py <repo>` and read the merged pull requests it lists. Draft the map: the product, every top-level path, how the pieces connect, a dated timeline of how development got here, the decisions that still shape the code, what was removed, and the debt and open threads. Done when every tracked top-level path is accounted for and every dated claim cites a commit, tag, or pull request. See [references/project-map.md](references/project-map.md).
4. **Ask only the gaps.** In one batch, ask what the evidence and the map couldn't settle: product intent and status, areas that are off-limits, who releases, why something was removed when it matters. Skip this step when nothing is missing.
5. **Close the loop.** Pick or build one check command that runs every fast check the repo has. Find where changes concentrate (churn in the inventory, the asks in the evidence) and give that code tests; where it has none, add characterization tests that pin today's behavior. Done when the command passes from a clean checkout. See [references/feedback-loops.md](references/feedback-loops.md).
6. **Hold behavior fixed.** Reach a green baseline with formatting and dead-reference fixes only, each in its own commit. A bug the new tests expose becomes a pending test (`test.todo`, `xfail`, `#[ignore]`), a line in the map's debt section, and a finding in the hand-off, not a fix.
7. **Clean the repo.** Ignore dependencies, build output, secrets, signing keys, and per-machine agent state (`.claude/settings.local.json`, `.claude/worktrees/`). Untrack mistakes with `git rm --cached`, which keeps the files on disk. When the release is a manual step that ships the wrong files, make it a command. Done when the inventory's "shouldn't be" section is empty or every remaining entry is intentional.
8. **Write the guide.** `AGENTS.md` at the root is the single source of truth for how to work, and links to the map with a line that says when to read it. `CLAUDE.md` is a short pointer that ends in `@AGENTS.md`, so Claude Code loads it. Merge existing instruction files into it rather than overwriting them. Done when every path and command in it has been checked against the repo and no line is a placeholder or generic advice. See [references/agents-md.md](references/agents-md.md).
9. **Run it in CI.** Add one workflow that runs the same check command, with read-only permissions and actions pinned to commit SHAs. Done when the workflow parses and the command it runs passed locally. Required checks and branch protection are the owner's call: offer them.
10. **Cold read.** Spawn a fresh subagent with no context and only the repo path. Ask it what the product is and how it runs; what to run before calling a change done; where it would make the most common change and what it would do first; what data or contracts it must preserve; how the project got to where it is and what was removed; how a release happens and who does the last step; and what was missing or confusing. Fix the guide or the map wherever it answered wrong or had to dig through code for an answer they should hold. Done when it answers all of them from the guide and the map.
11. **Hand off.** Commit in reviewable pieces: hygiene, formatting, dead references, tooling and tests, guide and map. Report what changed, the bugs and risks the work exposed, what you couldn't verify, and the decisions left to the owner.

## Already bootstrapped

Audit instead of regenerating. Run the check command, verify every path and command `AGENTS.md` names, check the map against the current tree, add the milestones since its last entry, and fix drift in place. Report "no change needed" when it all holds.

## Rules

- A line in `AGENTS.md` states something true about this repo, or a rule with its reason. Guidance any agent already follows is noise.
- The map separates fact from inference, and marks every inference with its source.
- Encode a recurring mistake as a check before writing it as prose.
- Evidence becomes principles. Transcript text, personal data and secrets stay out of the repo, and preferences that belong to the person go to their global instructions, with their agreement.
- Vendored code, product copy, and links the owner controls stay as they are.
- Ask before publishing, deploying, pushing to a protected branch, or changing repository settings.
