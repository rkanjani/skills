import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "mirroring_guard.py"
SPEC = importlib.util.spec_from_file_location("mirroring_guard", SCRIPT)
guard = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = guard
SPEC.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def test_linux_status_fails_safely(self):
        result = subprocess.run([sys.executable, SCRIPT, "status"], text=True, capture_output=True)
        payload = json.loads(result.stdout)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(payload["usable"])
        self.assertIn("user's Mac", payload["message"])

    def test_sensitive_input_is_denied(self):
        for task in ("type my password", "enter the 2FA code", "fill in card number"):
            with self.subTest(task=task):
                self.assertFalse(guard.authorize("Example", task).allowed)

    def test_missing_permission_blocks_macos_status(self):
        original = guard._run
        guard._run = lambda script: (True, "false") if "UI elements" in script else (True, "true")
        try:
            payload, code = guard.mac_status()
        finally:
            guard._run = original
        self.assertEqual(code, 3)
        self.assertFalse(payload["usable"])
        self.assertFalse(payload["accessibility"])

    def test_consequential_action_requires_fresh_confirmation(self):
        denied = guard.check_action("purchase", "Buy the named $1 test item", False, 1)
        allowed = guard.check_action("purchase", "Buy the named $1 test item", True, 1)
        self.assertFalse(denied.allowed)
        self.assertTrue(allowed.allowed)

    def test_bounded_non_sensitive_action_is_allowed(self):
        self.assertTrue(guard.check_action("tap", "Open settings", False, 3).allowed)
        self.assertFalse(guard.check_action("tap", "Open settings", False, 21).allowed)

    def test_unknown_action_is_denied(self):
        self.assertFalse(guard.check_action("run-script", "Do a thing", True, 1).allowed)


if __name__ == "__main__":
    unittest.main()
