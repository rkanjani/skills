---
name: export-chats
description: Export every Claude Code and Codex chat about a project into one zip of readable transcripts plus raw session files. Use when the user asks for a dump, export, archive, backup or zip of their chats, conversations or sessions about a project, app or repo.
---

# Export chats

Bundle a project's chat history from both agents on this machine into one zip: a readable Markdown transcript per session, the raw session JSONL, an `index.csv`, and a README. `scripts/export_chats.py` does the deterministic work.

## Steps

1. **Pick the match terms.** Use the project the user names; when they say "this project", take the repo folder name and its git remote name (`git remote get-url origin`). Add the product's other spellings when they differ, such as the repo name and the brand name. Done when you have one or more terms that each name only this project.

2. **Dry-run the match.** Run:

   ```bash
   python3 -I <skill>/scripts/export_chats.py --match <term> [--match <term> ...] --dry-run
   ```

   A session matches when a term appears in its working directory, git remote, Claude project folder name, or a Codex thread's first message, ignoring case and punctuation. Read the listed folders and threads. Done when every listed item is this project and nothing obvious is missing; narrow a term that pulls in other projects and add one when a known session is absent.

3. **Export.** Run the same command with `--out <path>.zip` instead of `--dry-run`. Write to a durable place the user can reach, such as `~/Documents/<project>-chats-<date>.zip`, never inside the repo. Large histories take a minute or more and can reach hundreds of MB, so run it in the background when it may pass two minutes. Done when the script prints the zip path and a nonzero session count.

4. **Spot-check.** Open one Claude Code and one Codex transcript from the zip (`unzip -p <zip> '*/codex/transcripts/*' | head -60`). Done when each shows real user messages and agent replies, not injected context. When a new kind of injected block shows through, add its tag to `INJECTED_TAGS` in the script and export again.

5. **Hand off.** Give the zip path, its size, and the session counts per agent, and send the file when a file-sending tool is available. Say that raw files can hold secrets from tool output, so the zip stays private.

## What the zip holds

- `index.csv`: every session oldest first, with tool, dates, title, folder, id, message count, transcript path.
- `claude-code/transcripts/`, `codex/transcripts/`: user and agent text only. Tool calls, subagent sidechains, and harness context (system reminders, environment and permission blocks, plugin lists, heartbeats, notifications) are left out.
- `claude-code/raw/<folder>/`: each matched `~/.claude/projects` folder copied whole, including subagent logs, saved tool results, and images.
- `codex/raw/`: each matched rollout, decompressed from `.zst`.

## Where sessions live

- Claude Code: `~/.claude/projects/<cwd with / and . turned into ->/<session>.jsonl`. Worktree sessions get their own folder, which is why matching on the folder name catches them.
- Codex: thread metadata in the newest `~/.codex/state_*.sqlite` (`threads` table: `cwd`, `git_origin_url`, `title`, `rollout_path`); rollouts in `~/.codex/sessions/` and `~/.codex/archived_sessions/`, usually zstd compressed. Without the database the script reads the `session_meta` line at the top of each rollout. Codex worktrees sit under `~/.codex/worktrees/<id>/<repo>`, so their cwd still carries the repo name.
- The script needs `zstd` on the PATH for compressed rollouts and reports any thread it could not read.
