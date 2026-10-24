#!/usr/bin/env python3
"""Print the raw material for a repository's development story from git (and gh, when signed in).

Covers the span and pace of work, quiet gaps, tags, merged pull requests, version
changes, when each top-level path appeared, what was removed, the largest commits,
TODO markers, and open issues and pull requests. Read-only.

Usage: repo_history.py [REPO] [--gap-months N]
"""

import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

VENDORED = re.compile(
    r"(^|/)(node_modules|bower_components|vendor|third_party|Pods|Carthage|\.venv|venv|dist|build|target|__pycache__)(/|$)"
)
PACKAGE = re.compile(r"^((?:.*/)?(?:node_modules|bower_components|vendor|third_party|Pods|Carthage)/)([^/]+)/")
JUNK = re.compile(r"(^|/)(\.DS_Store|Thumbs\.db|desktop\.ini)$")
VERSION_FILES = {
    "package.json": r'"version"\s*:\s*"([^"]+)"',
    "manifest.json": r'"version"\s*:\s*"([^"]+)"',
    "Cargo.toml": r'^version\s*=\s*"([^"]+)"',
    "pyproject.toml": r'^version\s*=\s*"([^"]+)"',
    "project.pbxproj": r"MARKETING_VERSION = ([^;]+);",
    "build.gradle": r'versionName\s+"([^"]+)"',
    "build.gradle.kts": r'versionName\s*=\s*"([^"]+)"',
    "app.json": r'"version"\s*:\s*"([^"]+)"',
}


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, errors="replace")
    return result.stdout if result.returncode == 0 else ""


def gh(repo: Path, *args: str) -> list:
    try:
        result = subprocess.run(["gh", *args], cwd=repo, capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    try:
        return json.loads(result.stdout) if result.returncode == 0 else []
    except json.JSONDecodeError:
        return []


def section(title: str, lines: list[str]) -> None:
    print(f"## {title}\n")
    print("\n".join(lines) if lines else "- none found")
    print()


def months_between(a: str, b: str) -> int:
    first, second = date.fromisoformat(a), date.fromisoformat(b)
    return (second.year - first.year) * 12 + second.month - first.month


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("repo", nargs="?", default=".")
    parser.add_argument("--gap-months", type=int, default=6, help="report quiet stretches at least this long")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    top = git(repo, "rev-parse", "--show-toplevel").strip()
    if not top:
        print(f"{repo} is not inside a git repository.", file=sys.stderr)
        return 1
    repo = Path(top)
    common = git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir").strip()
    name = Path(common).parent.name if common.endswith("/.git") else repo.name

    log = git(repo, "log", "--reverse", "--no-renames", "--date=short", "--name-status", "--format=@@%h\t%ad\t%an\t%s")
    commits, current = [], None
    for line in log.splitlines():
        if line.startswith("@@"):
            sha, day, author, subject = (line[2:].split("\t", 3) + [""])[:4]
            current = {"sha": sha, "date": day, "author": author, "subject": subject, "files": []}
            commits.append(current)
        elif line and current is not None and "\t" in line:
            status, path = line.split("\t", 1)
            current["files"].append((status[0], path.split("\t")[-1]))
    if not commits:
        print("No commits.")
        return 0

    print(f"# History: {name}\n")
    first, last = commits[0], commits[-1]
    authors = {c["author"] for c in commits}
    print(f"- First commit: {first['date']} {first['sha']} {first['subject']}")
    print(f"- Latest commit: {last['date']} {last['sha']} {last['subject']}")
    print(f"- Commits: {len(commits)} by {len(authors)} author(s)\n")

    per_year = Counter(c["date"][:4] for c in commits)
    section("Commits per year", [f"- {year}: {n}" for year, n in sorted(per_year.items())])

    gaps = []
    for before, after in zip(commits, commits[1:]):
        if months_between(before["date"], after["date"]) >= args.gap_months:
            gaps.append(
                f"- {before['date']} to {after['date']}: quiet, resumed with {after['sha']} {after['subject']}"
            )
    section(f"Quiet stretches of {args.gap_months}+ months", gaps)

    tags = git(repo, "for-each-ref", "--sort=creatordate", "--format=%(creatordate:short) %(refname:short)", "refs/tags")
    section("Tags", [f"- {t}" for t in tags.splitlines()])

    merges = git(repo, "log", "--reverse", "--merges", "--date=short", "--format=%ad%x09%h%x09%s%x09%b")
    prs = []
    for line in merges.splitlines():
        parts = (line.split("\t") + ["", "", "", ""])[:4]
        if match := re.match(r"Merge pull request (#\d+)", parts[2]):
            title = parts[3].strip().splitlines()[0] if parts[3].strip() else parts[2]
            prs.append(f"- {parts[0]} {match.group(1)} ({parts[1]}): {title}")
    section("Merged pull requests", prs)

    versions = []
    tracked = git(repo, "ls-files").splitlines()
    for file in [f for f in tracked if Path(f).name in VERSION_FILES and not VENDORED.search(f) and f.count("/") <= 3]:
        pattern = re.compile(VERSION_FILES[Path(file).name], re.M)
        history = git(repo, "log", "--reverse", "--date=short", "--format=%h\t%ad", "-n", "300", "--", file)
        previous = None
        for row in history.splitlines():
            sha, day = row.split("\t")
            match = pattern.search(git(repo, "show", f"{sha}:{file}"))
            value = match.group(1).strip() if match else None
            if value and value != previous:
                versions.append(f"- {day} {sha} {file}: {previous or 'first'} -> {value}")
                previous = value
    section("Version changes", versions[-40:])

    appeared, removed, current_top = {}, defaultdict(set), {p.split("/")[0] for p in tracked}
    packages_removed = {}
    for commit in commits:
        for status, path in commit["files"]:
            head = path.split("/")[0]
            if status == "A" and head not in appeared:
                appeared[head] = commit
            if status != "D" or JUNK.search(path):
                continue
            if package := PACKAGE.match(path):
                packages_removed[package.groups()] = commit
            elif not VENDORED.search(path):
                removed[head if "/" in path else path].add(path)
    section(
        "When each current top-level path first appeared",
        [f"- {head}: {c['date']} {c['sha']} {c['subject']}" for head, c in sorted(appeared.items(), key=lambda kv: kv[1]["date"]) if head in current_top],
    )
    still_there = set(tracked)
    gone = []
    for head, paths in sorted(removed.items()):
        missing = sorted(p for p in paths if p not in still_there)
        if not missing:
            continue
        last_delete = max(
            (c for c in commits if any(s == "D" and p in missing for s, p in c["files"])), key=lambda c: c["date"]
        )
        label = head if head not in current_top or "/" not in missing[0] else f"{head}/ (some files)"
        gone.append(f"- {label}: {len(missing)} file(s), last removed {last_delete['date']} {last_delete['sha']} {last_delete['subject']}")
    section("Removed and not restored", gone[:40])

    vendored, whole_roots = [], set()
    for (root, name), commit in sorted(packages_removed.items()):
        if any(p.startswith(root + name + "/") for p in tracked):
            continue
        if not any(p.startswith(root) for p in tracked):
            whole_roots.add(root)
            continue
        vendored.append(f"- {root}{name}: last removed {commit['date']} {commit['sha']} {commit['subject']}")
    for root in sorted(whole_roots):
        last = max((c for (r, _), c in packages_removed.items() if r == root), key=lambda c: c["date"])
        vendored.insert(0, f"- {root} (the whole folder): last removed {last['date']} {last['sha']} {last['subject']}")
    section("Vendored packages removed", vendored[:40])

    sized = sorted(
        commits,
        key=lambda c: sum(1 for _, p in c["files"] if not VENDORED.search(p)),
        reverse=True,
    )
    section(
        "Largest commits by first-party files touched",
        [
            f"- {c['date']} {c['sha']} ({sum(1 for _, p in c['files'] if not VENDORED.search(p))} files): {c['subject']}"
            for c in sized[:8]
        ],
    )

    markers = git(repo, "grep", "-n", "-I", "-E", r"\b(TODO|FIXME|HACK|XXX)\b", "--", ".", ":!*node_modules*", ":!*vendor*", ":!*bower_components*")
    section("TODO markers", [f"- {line.strip()[:160]}" for line in markers.splitlines()[:20]])

    issues = gh(repo, "issue", "list", "--state", "open", "--limit", "20", "--json", "number,title,createdAt")
    pulls = gh(repo, "pr", "list", "--state", "open", "--limit", "20", "--json", "number,title,createdAt,isDraft")
    section(
        "Open issues and pull requests (gh)",
        [f"- issue #{i['number']} ({i['createdAt'][:10]}): {i['title']}" for i in issues]
        + [f"- PR #{p['number']} ({p['createdAt'][:10]}{', draft' if p['isDraft'] else ''}): {p['title']}" for p in pulls],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
