#!/usr/bin/env python3
"""Export every Claude Code and Codex session about a project into one zip.

Usage:
  export_chats.py --match <term> [--match <term> ...] --out <file.zip> [--dry-run]

A session matches when a term appears (case-insensitive, punctuation ignored) in
its working directory, its git remote, its Claude project folder name, or the
first user message of a Codex thread.
"""

import argparse
import csv
import datetime
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HOME = Path.home()
CLAUDE_PROJECTS = HOME / ".claude" / "projects"
CODEX = HOME / ".codex"

# Context the harness injects into user turns. Stripped from readable transcripts only.
INJECTED_TAGS = (
    "system-reminder|heartbeat|recommended_plugins|in-app-browser-context|skill|"
    "task-notification|codex_internal_context|side-sessions-event|external_codex_apps_open_page|"
    "ci-monitor-event|scheduled-task|environment_context|user_instructions|permissions"
)
INJECTED_PREFIXES = ("<command-", "<local-command", "# AGENTS.md", "Caveat:")


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def matches(terms, *fields):
    blob = norm(" ".join(f or "" for f in fields))
    return any(t in blob for t in terms)


def slug(s, n=60):
    s = re.sub(r"[^A-Za-z0-9]+", "-", s or "").strip("-").lower()
    return s[:n] or "untitled"


def text_of(content):
    if isinstance(content, str):
        return content
    parts = []
    for c in content or []:
        if isinstance(c, dict) and c.get("type") in ("text", "input_text", "output_text"):
            parts.append(c.get("text", ""))
    return "\n".join(parts)


def clean_user(t):
    t = re.sub(rf"<({INJECTED_TAGS})\b[^>]*>.*?</\1[^>]*>", "", t, flags=re.S).strip()
    return "" if (not t or t.startswith(INJECTED_PREFIXES)) else t


def iso(v):
    try:
        n = int(v)
        if n > 10**11:
            n //= 1000
        return datetime.datetime.fromtimestamp(n, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return str(v or "")


def write_transcript(path, title, meta, turns, agent):
    with open(path, "w") as o:
        o.write(f"# {title}\n\n")
        for k, v in meta.items():
            o.write(f"- {k}: {v}\n")
        o.write("\n---\n\n")
        for role, ts, t in turns:
            o.write(f"## {'You' if role == 'user' else agent} · {ts}\n\n{t}\n\n")


def claude_sessions(terms):
    if not CLAUDE_PROJECTS.is_dir():
        return []
    found = []
    for proj in sorted(CLAUDE_PROJECTS.iterdir()):
        if not proj.is_dir():
            continue
        if matches(terms, proj.name):
            found.append(proj)
            continue
        # Folder name did not match: check the cwd recorded inside its sessions.
        for f in proj.glob("*.jsonl"):
            with f.open(errors="replace") as fh:
                head = fh.read(200_000)
            if any(matches(terms, m) for m in re.findall(r'"cwd":"([^"]+)"', head)):
                found.append(proj)
                break
    return found


def export_claude(projects, out, index):
    for proj in projects:
        short = re.sub(r"^-Users-[^-]+-(Documents-)?", "", proj.name) or proj.name
        shutil.copytree(proj, out / "claude-code" / "raw" / short, dirs_exist_ok=True)
        for f in sorted(proj.glob("*.jsonl")):
            turns, first_ts, last_ts, title = [], None, None, None
            for line in f.open(errors="replace"):
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                if not title and d.get("type") in ("summary", "ai-title", "custom-title"):
                    title = d.get("summary") or d.get("aiTitle") or d.get("customTitle")
                if d.get("type") not in ("user", "assistant") or d.get("isSidechain") or d.get("isMeta"):
                    continue
                ts = d.get("timestamp")
                first_ts = first_ts or ts
                last_ts = ts or last_ts
                t = text_of((d.get("message") or {}).get("content"))
                if d["type"] == "user":
                    t = clean_user(t)
                if t.strip():
                    turns.append((d["type"], ts, t.strip()))
            if not turns:
                continue
            first_user = next((t for r, _, t in turns if r == "user"), "untitled")
            title = title or first_user.splitlines()[0][:80]
            name = f"{(first_ts or '')[:10]}_{slug(short, 50)}_{f.stem[:8]}.md"
            write_transcript(
                out / "claude-code" / "transcripts" / name,
                title,
                {"Tool": "Claude Code", "Folder": short, "Session": f.stem,
                 "Started": first_ts, "Last activity": last_ts},
                turns,
                "Claude",
            )
            index.append(["claude-code", first_ts, last_ts, title, short, f.stem, len(turns),
                          f"claude-code/transcripts/{name}"])


def read_rollout(path):
    if path.suffix == ".zst":
        try:
            return subprocess.run(["zstd", "-dc", str(path)], capture_output=True, check=True).stdout
        except (OSError, subprocess.CalledProcessError):
            return None
    return path.read_bytes()


def codex_threads(terms):
    """Yield (id, rollout file, cwd, title, created, updated, branch) for matching threads."""
    dbs = sorted(CODEX.glob("state_*.sqlite"))
    if dbs:
        db = sqlite3.connect(f"file:{dbs[-1]}?mode=ro", uri=True)
        cols = {r[1] for r in db.execute("pragma table_info(threads)")}
        name_expr = "coalesce(nullif(name,''), title)" if "name" in cols else "title"
        rows = db.execute(
            f"select id, rollout_path, cwd, {name_expr}, created_at, updated_at, git_branch, "
            "git_origin_url, first_user_message from threads"
        ).fetchall()
        for tid, rp, cwd, title, ca, ua, br, origin, first in rows:
            if matches(terms, cwd, origin, first):
                yield tid, locate_rollout(tid, rp), cwd, title, iso(ca), iso(ua), br
        return
    # No state database: fall back to the session_meta line at the top of each rollout.
    for f in CODEX.glob("*sessions/**/rollout-*"):
        data = read_rollout(f)
        if not data:
            continue
        try:
            meta = json.loads(data.split(b"\n", 1)[0]).get("payload", {})
        except ValueError:
            continue
        git = meta.get("git") or {}
        if matches(terms, meta.get("cwd"), git.get("repository_url")):
            yield meta.get("id", f.stem), f, meta.get("cwd"), None, meta.get("timestamp"), "", git.get("branch")


def locate_rollout(tid, recorded):
    if recorded:
        for c in (Path(recorded), Path(recorded + ".zst")):
            if c.exists():
                return c
    hits = list(CODEX.glob(f"*sessions/**/*{tid}*"))
    return hits[0] if hits else None


def export_codex(threads, out, index, missing):
    for tid, src, cwd, title, created, updated, branch in threads:
        data = read_rollout(src) if src else None
        if data is None:
            missing.append(tid)
            continue
        (out / "codex" / "raw" / src.name.removesuffix(".zst")).write_bytes(data)
        turns = []
        for line in data.decode(errors="replace").splitlines():
            try:
                d = json.loads(line)
            except ValueError:
                continue
            p = d.get("payload") or {}
            if d.get("type") != "response_item" or p.get("type") != "message":
                continue
            if p.get("role") not in ("user", "assistant"):
                continue
            t = text_of(p.get("content"))
            if p["role"] == "user":
                t = clean_user(t)
            if t.strip():
                turns.append((p["role"], d.get("timestamp"), t.strip()))
        if not title:
            title = next((t.splitlines()[0][:80] for r, _, t in turns if r == "user"), "untitled")
        name = f"{created[:10]}_{slug(title)}_{tid[-8:]}.md"
        write_transcript(
            out / "codex" / "transcripts" / name,
            title,
            {"Tool": "Codex", "Folder": cwd, "Branch": branch, "Thread": tid,
             "Started": created, "Last activity": updated},
            turns,
            "Codex",
        )
        index.append(["codex", created, updated, title, cwd, tid, len(turns), f"codex/transcripts/{name}"])


README = """# Chat export: {label} ({date})

Use this to bootstrap a new conversation about the project: upload the two `transcripts/`
folders and `index.csv` to a fresh chat, Claude project, or agent so it starts with the
project's history. Leave `raw/` out.

- `index.csv`: every session, oldest first, with title, folder and transcript path.
- `claude-code/transcripts/`, `codex/transcripts/`: readable Markdown of your messages and the
  agent's replies. Tool calls and injected context are left out.
- `claude-code/raw/`, `codex/raw/`: the original session JSONL with every tool call, plus
  Claude Code's subagent logs, saved tool outputs and images.

Raw files can hold secrets that appeared in tool output (env values, tokens). Keep this archive private.
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--match", action="append", required=True, help="project term; repeatable")
    ap.add_argument("--out", help="zip file to write (required unless --dry-run)")
    ap.add_argument("--dry-run", action="store_true", help="count matches without writing")
    args = ap.parse_args()

    terms = [norm(t) for t in args.match if norm(t)]
    if not terms:
        sys.exit("--match needs at least one letter or digit")
    projects = claude_sessions(terms)
    threads = list(codex_threads(terms))
    print(f"claude-code project folders: {len(projects)}")
    print(f"codex threads: {len(threads)}")
    if args.dry_run:
        for p in projects:
            print("  claude:", p.name)
        for t in threads:
            print("  codex: ", t[4][:10], t[3] or t[0], "|", t[2])
        return

    if not args.out:
        sys.exit("--out is required")
    label = args.match[0]
    out_zip = Path(args.out).expanduser().resolve()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / f"{slug(label)}-chats"
        for d in ("claude-code/raw", "claude-code/transcripts", "codex/raw", "codex/transcripts"):
            (root / d).mkdir(parents=True)
        index, missing = [], []
        export_claude(projects, root, index)
        export_codex(threads, root, index, missing)
        index.sort(key=lambda r: r[1] or "")
        with open(root / "index.csv", "w", newline="") as o:
            w = csv.writer(o)
            w.writerow(["tool", "started", "last_activity", "title", "folder", "session_id",
                        "messages", "transcript"])
            w.writerows(index)
        (root / "README.md").write_text(
            README.format(label=", ".join(args.match), date=datetime.date.today().isoformat()))

        out_zip.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for f in sorted(root.rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(root.parent))

    n_claude = sum(r[0] == "claude-code" for r in index)
    print(f"sessions with messages: {len(index)} (claude-code {n_claude}, codex {len(index) - n_claude})")
    if missing:
        print(f"codex threads with no readable rollout file: {len(missing)} (is zstd installed?)")
    print(f"zip: {out_zip} ({out_zip.stat().st_size / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
