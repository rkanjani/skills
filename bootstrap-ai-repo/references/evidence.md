# Evidence

## Sources, best first

1. **Past agent sessions in this repo.** `scripts/session_evidence.py <repo>` prints what people typed in Claude Code sessions (`~/.claude/projects/*/*.jsonl`) and Codex sessions (`~/.codex/sessions`, `~/.codex/archived_sessions`) whose working directory was the repo or one of its worktrees. Add `--since YYYY-MM-DD` to focus on recent work. Other agents keep history elsewhere; look for it the same way, and skip it when there is none.
2. **Saved memory.** Claude Code project memory (`~/.claude/projects/<project>/memory/`) and Codex memories (`~/.codex/memories*`).
3. **Global instructions.** `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, and any rules they import.
4. **The user's other repos.** Their `AGENTS.md` files show house style: headings, length, tone, punctuation, how `CLAUDE.md` points at `AGENTS.md`, how CI is pinned and protected.
5. **Git history.** Fix and revert commits, features that were removed, and the commit message convention.
6. **Reviews and issues**, when the forge CLI is signed in: recent merged pull requests and their review comments.

## What to extract

- **Asks**: the changes people request most. They decide which code gets a loop first and what the "common change" section says.
- **Corrections**: places where a person told an agent it was wrong. Each one is a candidate check or gotcha.
- **Standing preferences**: tone, length, punctuation, commit and pull request conventions, attribution, what not to touch.
- **Commands that worked**: exact invocations that ran, especially ones with non-obvious flags.

A correction becomes a rule when it recurs or when the person stated it as one. One-off reactions stay out.

## Privacy

Transcripts are working material. Summarize them into principles. Transcript text, names, emails, account IDs, home-folder paths and secrets never go into the repo.
