#!/usr/bin/env python3
"""Print what people typed in past Claude Code and Codex sessions for one repository.

Reads local transcripts only and writes nothing. The output is working evidence
for the agent: summarize it into principles, never paste it into the repository.

Usage: session_evidence.py [REPO] [--max-chars N] [--max-messages N] [--since YYYY-MM-DD]
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
CLAUDE_PROJECTS = HOME / ".claude" / "projects"
CODEX_DIRS = [HOME / ".codex" / "sessions", HOME / ".codex" / "archived_sessions"]

# Injected context that shows up as user messages but wasn't typed by a person.
NOISE_PREFIXES = (
    "<environment_context>",
    "<user_instructions>",
    "# AGENTS.md instructions",
    "<permissions instructions>",
    "Caveat:",
    "[Request interrupted",
    "This session is being continued",
)
# Harness-injected blocks use custom tag names (system-reminder, task-notification, ...).
TAG_BLOCK = re.compile(r"<(image|skill|[a-z]+[-_][a-z_-]+)(?:\s[^>]*)?>.*?</\1>", re.S)
UNCLOSED_TAG = re.compile(r"^</?(image|skill|[a-z]+[-_][a-z_-]+)[\s>]")


def repo_prefixes(repo: Path) -> list[str]:
    prefixes = {str(repo), f"{repo.parent}/{repo.name}-worktrees"}
    try:
        listing = subprocess.run(
            ["git", "-C", str(repo), "worktree", "list", "--porcelain"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        prefixes.update(line[9:] for line in listing.splitlines() if line.startswith("worktree "))
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return sorted(prefixes)


def belongs(cwd: str, repo: Path, prefixes: list[str]) -> bool:
    if not cwd:
        return False
    if any(cwd == p or cwd.startswith(p.rstrip("/") + "/") for p in prefixes):
        return True
    # Codex keeps its own worktrees as ~/.codex/worktrees/<id>/<repo name>.
    return "/.codex/worktrees/" in cwd and Path(cwd).name == repo.name


def clean(text: str) -> str:
    text = TAG_BLOCK.sub("", text).strip()
    if not text or text.startswith(NOISE_PREFIXES) or UNCLOSED_TAG.match(text):
        return ""
    return re.sub(r"\n{3,}", "\n\n", text)


def open_lines(path: Path):
    if path.suffix == ".zst":
        try:
            out = subprocess.run(["zstd", "-dc", str(path)], capture_output=True, check=True).stdout
        except (subprocess.CalledProcessError, FileNotFoundError):
            return []
        return out.decode("utf-8", "replace").splitlines()
    try:
        return path.read_text("utf-8", "replace").splitlines()
    except OSError:
        return []


def parse_claude(path: Path):
    cwd, started, typed, seen = "", "", [], set()
    for line in open_lines(path):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        cwd = cwd or entry.get("cwd", "")
        started = started or entry.get("timestamp", "")
        if entry.get("type") != "user" or entry.get("isMeta") or entry.get("isSidechain"):
            continue
        content = (entry.get("message") or {}).get("content")
        if isinstance(content, list):
            content = "\n".join(
                block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text"
            )
        if isinstance(content, str) and (text := clean(content)) and text not in seen:
            seen.add(text)
            typed.append(text)
    return cwd, started, typed


def parse_codex(path: Path):
    cwd, started, typed, seen = "", "", [], set()
    for line in open_lines(path):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        payload = entry.get("payload") or {}
        if entry.get("type") == "session_meta":
            cwd = payload.get("cwd", cwd)
            started = payload.get("timestamp", entry.get("timestamp", ""))
            continue
        texts = []
        if entry.get("type") == "event_msg" and payload.get("type") == "user_message":
            texts = [payload.get("message", "")]
        elif payload.get("type") == "message" and payload.get("role") == "user":
            texts = [part.get("text", "") for part in payload.get("content", []) if isinstance(part, dict)]
        for raw in texts:
            text = clean(raw or "")
            if text and text not in seen:
                seen.add(text)
                typed.append(text)
    return cwd, started, typed


def encode(path: str) -> str:
    # Claude Code names each project folder after its cwd with every other character as "-".
    return re.sub(r"[^A-Za-z0-9]", "-", path)


def codex_cwd(path: Path) -> str:
    if path.suffix == ".zst":
        try:
            with subprocess.Popen(["zstd", "-dc", str(path)], stdout=subprocess.PIPE) as proc:
                first = proc.stdout.readline()
                proc.kill()
        except FileNotFoundError:
            return ""
    else:
        with path.open("rb") as handle:
            first = handle.readline()
    try:
        entry = json.loads(first)
    except json.JSONDecodeError:
        return ""
    return (entry.get("payload") or {}).get("cwd", "") if entry.get("type") == "session_meta" else ""


def sessions(repo: Path, prefixes: list[str]):
    encoded = [encode(p.rstrip("/")) for p in prefixes]
    if CLAUDE_PROJECTS.is_dir():
        folders = [d for d in CLAUDE_PROJECTS.iterdir() if d.name.startswith(tuple(encoded))]
        for path in (f for d in folders for f in d.glob("*.jsonl")):
            cwd, started, typed = parse_claude(path)
            if belongs(cwd, repo, prefixes) and typed:
                yield "Claude Code", started, cwd, path, typed
    for base in CODEX_DIRS:
        if not base.is_dir():
            continue
        for path in base.rglob("*.jsonl*"):
            if not belongs(codex_cwd(path), repo, prefixes):
                continue
            cwd, started, typed = parse_codex(path)
            if belongs(cwd, repo, prefixes) and typed:
                yield "Codex", started, cwd, path, typed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("repo", nargs="?", default=".")
    parser.add_argument("--max-chars", type=int, default=500, help="truncate each message")
    parser.add_argument("--max-messages", type=int, default=12, help="per session")
    parser.add_argument("--since", default="", help="skip sessions that started earlier (YYYY-MM-DD)")
    args = parser.parse_args()

    repo = Path(os.path.realpath(args.repo))
    try:
        top = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        repo = Path(top).parent if top.endswith("/.git") else repo
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    prefixes = repo_prefixes(repo)
    found = sorted(sessions(repo, prefixes), key=lambda s: s[1])
    found = [s for s in found if s[1][:10] >= args.since]
    print(f"# Session evidence for {repo}\n")
    print(f"Matched {len(found)} session(s) under: {', '.join(prefixes)}\n")
    for tool, started, cwd, path, typed in found:
        print(f"## {started[:10] or 'unknown date'} · {tool} · {cwd}")
        print(f"Source: {path}\n")
        for text in typed[: args.max_messages]:
            short = text if len(text) <= args.max_chars else text[: args.max_chars].rstrip() + " …"
            print("- " + short.replace("\n", "\n  "))
        if len(typed) > args.max_messages:
            print(f"- … {len(typed) - args.max_messages} more message(s)")
        print()
    if not found:
        print("No sessions found. Fall back to git history, review comments and existing instruction files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
