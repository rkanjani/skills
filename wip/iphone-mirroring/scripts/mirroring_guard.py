#!/usr/bin/env python3
"""Non-interactive safety preflight for the WIP iPhone Mirroring skill.

This helper deliberately does not capture screens, request permissions, or drive UI.
"""

from __future__ import annotations

import argparse
import json
import platform
import re
import subprocess
import sys
from dataclasses import asdict, dataclass


SENSITIVE = re.compile(
    r"\b(password|passcode|api[ -]?key|card (?:data|number)|cvv|cvc|recovery code|"
    r"(?:2fa|two[ -]?factor|one[ -]?time|otp) code|captcha|account recovery)\b",
    re.IGNORECASE,
)
PRIVATE_APPS = {
    "messages", "mail", "photos", "health", "passwords", "1password",
    "bitwarden", "lastpass", "banking",
}
CONFIRMATION_KINDS = {
    "payment", "checkout", "purchase", "transfer", "destructive-delete",
    "irreversible-submit",
}
SAFE_KINDS = {"navigate", "tap", "scroll", "type-nonsensitive"}


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str


def authorize(app: str, task: str) -> Decision:
    app, task = app.strip(), task.strip()
    if not app or not task:
        return Decision(False, "Explicit authorization must name both an app and a bounded task.")
    if SENSITIVE.search(task):
        return Decision(False, "The task requests prohibited sensitive-input handling.")
    if app.casefold() in PRIVATE_APPS and len(task.split()) < 2:
        return Decision(False, "Private-app authorization must name a specific bounded task.")
    return Decision(True, "Named app and bounded task recorded for this ephemeral run only.")


def check_action(kind: str, description: str, confirmed: bool, max_actions: int) -> Decision:
    if max_actions < 1 or max_actions > 20:
        return Decision(False, "Action bound must be between 1 and 20.")
    if not description.strip():
        return Decision(False, "An exact action description is required.")
    if SENSITIVE.search(description):
        return Decision(False, "Sensitive input or authentication handling is prohibited.")
    if kind in CONFIRMATION_KINDS:
        if not confirmed:
            return Decision(False, "Fresh action-specific confirmation is required immediately before this action.")
        return Decision(True, "Fresh confirmation gate satisfied; verify scope again before acting.")
    if kind not in SAFE_KINDS:
        return Decision(False, "Unknown or unbounded action kind.")
    return Decision(True, "Bounded non-sensitive action passes the policy preflight.")


def _run(script: str) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            ["osascript", "-e", script], capture_output=True, text=True, timeout=5, check=False
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"probe failed: {type(exc).__name__}"
    return result.returncode == 0, (result.stdout or result.stderr).strip()


def mac_status() -> tuple[dict[str, object], int]:
    access_ok, access = _run('tell application "System Events" to return UI elements enabled')
    accessibility = access_ok and access.casefold() == "true"
    window_ok, window = _run(
        'tell application "System Events" to tell process "iPhone Mirroring" '
        'to return (visible is true) and ((count of windows) > 0)'
    )
    visible_window = window_ok and window.casefold() == "true"
    recording_ok, recording = _run(
        'use framework "CoreGraphics"\nreturn current application\'s CGPreflightScreenCaptureAccess()'
    )
    screen_recording = recording_ok and recording.casefold() == "true"
    usable = accessibility and visible_window and screen_recording
    result = {
        "supported_host": True,
        "adapter": "apple-iphone-mirroring",
        "visible_window": visible_window,
        "accessibility": accessibility,
        "screen_recording": screen_recording,
        "usable": usable,
        "message": "Mirrored window is ready." if usable else "Mirroring or a required permission is unavailable; resolve it manually in macOS settings.",
    }
    return result, 0 if usable else 3


def status() -> tuple[dict[str, object], int]:
    if platform.system() != "Darwin":
        return ({
            "supported_host": False,
            "adapter": "apple-iphone-mirroring",
            "visible_window": False,
            "usable": False,
            "message": "Apple iPhone Mirroring is unavailable on this host; macOS/iPhone verification must run on the user's Mac.",
        }, 2)
    return mac_status()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    auth = sub.add_parser("authorize")
    auth.add_argument("--app", required=True)
    auth.add_argument("--task", required=True)
    action = sub.add_parser("check-action")
    action.add_argument("--kind", required=True)
    action.add_argument("--description", required=True)
    action.add_argument("--confirmed", action="store_true")
    action.add_argument("--max-actions", type=int, default=1)
    args = parser.parse_args(argv)
    if args.command == "status":
        payload, code = status()
    else:
        decision = authorize(args.app, args.task) if args.command == "authorize" else check_action(
            args.kind, args.description, args.confirmed, args.max_actions
        )
        payload, code = asdict(decision), 0 if decision.allowed else 4
    print(json.dumps(payload, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
