#!/usr/bin/env python3
"""Print a factual inventory of a git repository for an agent bootstrapping it.

Covers stack signals, declared commands, existing agent instructions, CI, tracked
files that look like they shouldn't be, and where changes concentrate. Read-only.

Usage: repo_inventory.py [REPO]
"""

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

VENDORED = re.compile(
    r"(^|/)(node_modules|bower_components|vendor|third_party|Pods|Carthage|\.venv|venv|dist|build|target|__pycache__)/"
)
LOCKFILES = re.compile(r"(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|Podfile\.lock|go\.sum)$")
STACK_FILES = {
    "package.json": "JavaScript/TypeScript (npm)",
    "pnpm-workspace.yaml": "pnpm workspace",
    "deno.json": "Deno",
    "pyproject.toml": "Python",
    "requirements.txt": "Python (pip)",
    "Cargo.toml": "Rust",
    "go.mod": "Go",
    "Package.swift": "Swift package",
    "Gemfile": "Ruby",
    "build.gradle": "Gradle",
    "build.gradle.kts": "Gradle (Kotlin)",
    "pom.xml": "Maven",
    "composer.json": "PHP",
    "mix.exs": "Elixir",
    "manifest.json": "Browser extension or web app manifest",
    "Dockerfile": "Docker",
    "Makefile": "Make",
    "justfile": "just",
    "vercel.json": "Vercel",
    "wrangler.toml": "Cloudflare Workers",
    "wrangler.jsonc": "Cloudflare Workers",
}
TOOL_CONFIG = re.compile(
    r"(^|/)(\.prettierrc[^/]*|prettier\.config\.[a-z]+|eslint\.config\.[a-z]+|\.eslintrc[^/]*|biome\.jsonc?|tsconfig[^/]*\.json"
    r"|vitest\.config\.[a-z]+|jest\.config\.[a-z]+|playwright\.config\.[a-z]+|pytest\.ini|ruff\.toml|\.ruff\.toml|mypy\.ini"
    r"|rustfmt\.toml|clippy\.toml|\.golangci\.ya?ml|\.swiftlint\.ya?ml|\.swiftformat|\.editorconfig|\.pre-commit-config\.yaml"
    r"|\.husky/[^/]+|lefthook\.ya?ml|\.gitleaks\.toml|\.tool-versions|\.nvmrc|\.node-version|rust-toolchain(\.toml)?)$"
)
AGENT_FILES = re.compile(
    r"(^|/)(AGENTS\.md|CLAUDE\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|copilot-instructions\.md|CONTEXT(-MAP)?\.md)$"
    r"|^\.(claude|cursor|codex|agents|github/instructions)/"
)
SUSPECT = re.compile(
    r"(^|/)(node_modules/|\.DS_Store$|Thumbs\.db$|\.env(\.[^/]*)?$|[^/]*\.(pem|p12|pfx|key|keystore|jks|mobileprovision|crx|log)$"
    r"|id_(rsa|ed25519)$|__pycache__/|\.venv/|\.pytest_cache/|\.mypy_cache/|coverage/|\.idea/|\.vscode/settings\.json$"
    r"|\.claude/settings\.local\.json$|\.claude/worktrees/)"
)
EXAMPLE_ENV = re.compile(r"\.env\.(example|sample|template)$")


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    return result.stdout if result.returncode == 0 else ""


def section(title: str, lines: list[str]) -> None:
    print(f"## {title}\n")
    print("\n".join(lines) if lines else "- none found")
    print()


def main() -> int:
    repo = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    top = git(repo, "rev-parse", "--show-toplevel").strip()
    if not top:
        print(f"{repo} is not inside a git repository.", file=sys.stderr)
        return 1
    repo = Path(top)
    files = [f for f in git(repo, "ls-files").splitlines() if f]
    owned = [f for f in files if not VENDORED.search(f)]

    print(f"# Inventory: {repo.name}\n")
    remote = git(repo, "remote", "get-url", "origin").strip() or "none"
    branch = git(repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").strip() or "unknown"
    commits = git(repo, "rev-list", "--count", "HEAD").strip() or "0"
    print(f"- Remote: {remote}\n- Default branch: {branch}\n- Commits: {commits}")
    print(f"- Tracked files: {len(files)} ({len(files) - len(owned)} under vendored or build folders)\n")

    by_ext = Counter(Path(f).suffix.lower() or Path(f).name for f in owned)
    section("Owned files by type", [f"- {ext}: {n}" for ext, n in by_ext.most_common(12)])

    stack = [f"- {f}: {STACK_FILES[Path(f).name]}" for f in owned if Path(f).name in STACK_FILES and f.count("/") <= 2]
    section("Stack signals", stack[:30])

    commands = []
    for pkg in [f for f in owned if Path(f).name == "package.json" and f.count("/") <= 2]:
        try:
            scripts = json.loads((repo / pkg).read_text()).get("scripts", {})
        except (OSError, json.JSONDecodeError):
            continue
        commands += [f"- {pkg} `{name}`: {cmd}" for name, cmd in scripts.items()]
    for make in [f for f in owned if Path(f).name in ("Makefile", "justfile") or f.endswith(".mk")]:
        targets = re.findall(r"^([A-Za-z0-9][\w.-]*)\s*:(?!=)", (repo / make).read_text(errors="replace"), re.M)
        if targets:
            commands.append(f"- {make} targets: {', '.join(dict.fromkeys(targets))}")
    section("Declared commands", commands)
    section("Tool config", [f"- {f}" for f in owned if TOOL_CONFIG.search(f)])
    section("Agent instructions and settings", [f"- {f}" for f in files if AGENT_FILES.search(f)])

    workflows = []
    for wf in [f for f in owned if f.startswith(".github/workflows/")]:
        runs = re.findall(r"^\s*(?:-\s*)?run:\s*(.+)$", (repo / wf).read_text(errors="replace"), re.M)
        workflows.append(f"- {wf}: " + ("; ".join(r.strip() for r in runs[:6]) or "no run steps"))
    section("CI workflows", workflows)

    docs = [f"- {f}" for f in owned if re.match(r"(README|LICENSE|CONTRIBUTING|SECURITY|PRIVACY|CHANGELOG)", Path(f).name, re.I) and f.count("/") <= 1]
    docs += [f"- {f}" for f in owned if f.startswith("docs/")][:20]
    section("Docs", docs)

    suspects = [f for f in files if SUSPECT.search(f) and not EXAMPLE_ENV.search(f)]
    grouped, example = Counter(), {}
    for f in suspects:
        kind = SUSPECT.search(f).group(2)
        grouped[kind] += 1
        example.setdefault(kind, f)
    large = []
    for f in owned:
        try:
            size = (repo / f).stat().st_size
        except OSError:
            continue
        if size > 5_000_000:
            large.append(f"- {f}: {size / 1_000_000:.1f} MB")
    hygiene = [f"- {kind}: {n} file(s), e.g. {example[kind]}" for kind, n in grouped.most_common(25)]
    if not (repo / ".gitignore").exists():
        hygiene.insert(0, "- no .gitignore at the root")
    section("Tracked files that usually shouldn't be", hygiene + large)

    churn = Counter(
        f
        for f in git(repo, "log", "--format=", "--name-only", "-n", "400").splitlines()
        if f and not VENDORED.search(f) and not LOCKFILES.search(f)
    )
    section("Most-changed files (last 400 commits)", [f"- {f}: {n}" for f, n in churn.most_common(12)])

    subjects = git(repo, "log", "--format=%s", "-n", "300").splitlines()
    fixes = [s for s in subjects if re.search(r"\b(fix|fixed|revert|hotfix|broke|regression)\b", s, re.I)]
    print(f"## Recent history\n\n- Fix or revert commits in the last {len(subjects)}: {len(fixes)}")
    for subject in fixes[:10]:
        print(f"  - {subject}")
    print("- Latest subjects:")
    for subject in subjects[:12]:
        print(f"  - {subject}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
