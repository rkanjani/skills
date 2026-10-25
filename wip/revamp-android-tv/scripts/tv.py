#!/usr/bin/env python3
"""Inspect and change an Android TV over ADB, with every change logged so it can be undone.

  tv.py connect HOST[:PORT]            connect over the network and wait for the TV to authorize
  tv.py pair HOST:PORT CODE            pair with wireless debugging (Android 11 and later)
  tv.py info                           model, Android version, current home screen, memory, storage
  tv.py packages [--json]              every package, classified from references/packages.tsv
  tv.py plan [--out FILE]              a starting plan: removals, privacy and speed settings
  tv.py apply PLAN [--dry-run]         apply a plan
  tv.py home install APK               install the home screen app
  tv.py home set [COMPONENT]           make it the default home screen
  tv.py home stock [--disable]         list, or turn off, the TV's other home screens
  tv.py home verify [--reboot]         press Home (or reboot) and check which home screen shows
  tv.py bench LABEL                    record free memory, process count, home start time, storage
  tv.py optimize                       compile apps ahead of time, trim caches, stop idle apps
  tv.py ui dump | key KEY... | focus TEXT | open ACTION_OR_COMPONENT
  tv.py shot FILE                      save a screenshot
  tv.py log                            show the change log
  tv.py restore [--remove-home] [--dry-run]   undo every logged change, newest first

Pass -s SERIAL when more than one device is connected. State lives in
$REVAMP_TV_HOME or ~/.config/revamp-android-tv/devices/<serial>/.
"""
import argparse
import fnmatch
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PACKAGES_TSV = os.path.join(HERE, "..", "references", "packages.tsv")
STATE = os.environ.get("REVAMP_TV_HOME") or os.path.expanduser("~/.config/revamp-android-tv")
HOME_PKG = "app.revamp.home"
HOME_COMPONENT = HOME_PKG + "/.HomeActivity"
KEYS = {"UP": 19, "DOWN": 20, "LEFT": 21, "RIGHT": 22, "CENTER": 23, "OK": 23, "ENTER": 66,
        "BACK": 4, "HOME": 3, "MENU": 82, "PLAY": 85, "SETTINGS": 176}
SPEED = {"global window_animation_scale": "0.5",
         "global transition_animation_scale": "0.5",
         "global animator_duration_scale": "0.5"}
PRIVACY = {"global wifi_scan_always_enabled": "0",
           "global ble_scan_always_enabled": "0"}


def die(msg, code=1):
    print(msg, file=sys.stderr)
    sys.exit(code)


def find_adb():
    if os.environ.get("ADB"):
        return os.environ["ADB"]
    found = shutil.which("adb")
    if found:
        return found
    for root in (os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT"),
                 os.path.expanduser("~/Library/Android/sdk"), os.path.expanduser("~/Android/Sdk")):
        if root and os.path.exists(os.path.join(root, "platform-tools", "adb")):
            return os.path.join(root, "platform-tools", "adb")
    die("adb not found. Install Android platform-tools (see references/connect.md).", 2)


class TV:
    def __init__(self, serial=None):
        self.adb = find_adb()
        self.serial = serial or self._only_device()
        self._dir = None

    def _only_device(self):
        out = subprocess.run([self.adb, "devices"], capture_output=True, text=True).stdout
        rows = [line.split() for line in out.splitlines()[1:] if line.strip()]
        ready = [r[0] for r in rows if len(r) > 1 and r[1] == "device"]
        if len(ready) == 1:
            return ready[0]
        if not ready:
            pending = [r[0] + " (" + r[1] + ")" for r in rows if len(r) > 1]
            die("No authorized device. " + ("Seen: " + ", ".join(pending) + ". Accept the prompt on the TV."
                                            if pending else "Run find_tv.py, then tv.py connect HOST."))
        die("Several devices connected: " + ", ".join(ready) + ". Pass -s SERIAL.")

    def run(self, *args, check=False, timeout=120):
        p = subprocess.run([self.adb, "-s", self.serial] + list(args), capture_output=True, text=True,
                           timeout=timeout)
        if check and p.returncode != 0:
            die("adb %s failed: %s" % (" ".join(args), (p.stderr or p.stdout).strip()))
        return p

    def sh(self, cmd, timeout=120):
        p = self.run("shell", cmd, timeout=timeout)
        return (p.stdout + p.stderr).strip()

    def prop(self, name):
        return self.sh("getprop " + name)

    @property
    def sdk(self):
        return int(self.prop("ro.build.version.sdk") or 0)

    @property
    def dir(self):
        if self._dir is None:
            ident = self.prop("ro.serialno") or self.serial
            self._dir = os.path.join(STATE, "devices", re.sub(r"[^A-Za-z0-9._-]", "_", ident))
            os.makedirs(self._dir, exist_ok=True)
        return self._dir

    def log(self, entry):
        entry["time"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        with open(os.path.join(self.dir, "changes.jsonl"), "a") as f:
            f.write(json.dumps(entry) + "\n")

    def changes(self):
        path = os.path.join(self.dir, "changes.jsonl")
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return [json.loads(line) for line in f if line.strip()]

    def save_changes(self, entries):
        with open(os.path.join(self.dir, "changes.jsonl"), "w") as f:
            for e in entries:
                f.write(json.dumps(e) + "\n")

    # ---- Queries ----

    def package_sets(self):
        def names(flags):
            return {line[8:] for line in self.sh("pm list packages " + flags).splitlines()
                    if line.startswith("package:")}
        everything = names("-u")
        installed = names("")
        return {"all": everything, "installed": installed, "system": names("-s -u"),
                "disabled": names("-d"), "removed": everything - installed}

    def activities(self, category):
        out = self.sh("cmd package query-activities --brief -a android.intent.action.MAIN -c " + category)
        return sorted({m.group(0) for m in re.finditer(r"[\w.]+/[\w.$]+", out)})

    def current_home(self):
        out = self.sh("cmd package resolve-activity --brief -a android.intent.action.MAIN "
                      "-c android.intent.category.HOME")
        found = re.findall(r"[\w.]+/[\w.$]+", out)
        return found[-1] if found else None

    def top_activity(self):
        out = self.sh("dumpsys activity activities | grep -E 'ResumedActivity|mFocusedApp' | head -5")
        m = re.search(r"u\d+ ([\w.]+/[\w.$]+)", out)
        return m.group(1) if m else None

    def setting(self, ns, key):
        v = self.sh("settings get %s %s" % (ns, key))
        return None if v == "null" else v


# ---- Classification ----

def load_rules():
    rules = []
    with open(PACKAGES_TSV) as f:
        for line in f:
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            rules.append((parts[0], parts[1], parts[2] if len(parts) > 2 else ""))
    return rules


def classify(pkg, system, rules):
    best = None
    for pattern, group, note in rules:
        if pattern == pkg:
            return group, note
        if "*" in pattern and fnmatch.fnmatchcase(pkg, pattern):
            # A core pattern always wins, so *hdmi* protects com.vendor.hdmi from com.vendor.*.
            rank = (group == "core", len(pattern))
            if best is None or rank > best[0]:
                best = (rank, group, note)
    if best:
        return best[1], best[2]
    return ("system", "") if system else ("user", "installed by you or the TV's store")


def inventory(tv):
    sets = tv.package_sets()
    rules = load_rules()
    tiles = {a.split("/")[0] for a in tv.activities("android.intent.category.LEANBACK_LAUNCHER")}
    rows = []
    for pkg in sorted(sets["all"]):
        group, note = classify(pkg, pkg in sets["system"], rules)
        state = "removed" if pkg in sets["removed"] else "disabled" if pkg in sets["disabled"] else "on"
        rows.append({"package": pkg, "group": group, "note": note, "state": state,
                     "system": pkg in sets["system"], "tile": pkg in tiles})
    return rows


# ---- Commands ----

def cmd_connect(args):
    adb = find_adb()
    target = args.host if ":" in args.host else args.host + ":5555"
    print(subprocess.run([adb, "connect", target], capture_output=True, text=True).stdout.strip())
    for i in range(60):
        out = subprocess.run([adb, "devices"], capture_output=True, text=True).stdout
        state = next((line.split()[1] for line in out.splitlines() if line.startswith(target)), None)
        if state == "device":
            print("Connected and authorized: " + target)
            return 0
        if i == 0 and state == "unauthorized":
            print("Waiting: accept 'Allow debugging?' on the TV (tick 'Always allow').")
        if state is None and i % 10 == 9:
            subprocess.run([adb, "connect", target], capture_output=True, text=True)
        time.sleep(1)
    die("Not authorized after 60 seconds. State: %s" % state)


def cmd_pair(args):
    p = subprocess.run([find_adb(), "pair", args.target, args.code], capture_output=True, text=True)
    print((p.stdout + p.stderr).strip())
    return p.returncode


def cmd_info(tv, args):
    mem = dict(re.findall(r"(\w+):\s+(\d+) kB", tv.sh("cat /proc/meminfo")))
    info = {
        "serial": tv.serial,
        "brand": tv.prop("ro.product.brand"),
        "manufacturer": tv.prop("ro.product.manufacturer"),
        "model": tv.prop("ro.product.model"),
        "device": tv.prop("ro.product.device"),
        "android": tv.prop("ro.build.version.release"),
        "sdk": tv.sdk,
        "google_tv": "com.google.android.apps.tv.launcherx" in tv.package_sets()["installed"],
        "home": tv.current_home(),
        "homes": tv.activities("android.intent.category.HOME"),
        "ram_mb": int(mem.get("MemTotal", 0)) // 1024,
        "ram_available_mb": int(mem.get("MemAvailable", 0)) // 1024,
        "setup_complete": tv.setting("secure", "user_setup_complete") == "1",
        "state_dir": tv.dir,
    }
    path = os.path.join(tv.dir, "info.json")
    with open(path, "w") as f:
        json.dump(info, f, indent=2)
    print(json.dumps(info, indent=2))


def cmd_packages(tv, args):
    rows = inventory(tv)
    path = os.path.join(tv.dir, "packages-%s.json" % time.strftime("%Y%m%d-%H%M%S"))
    with open(path, "w") as f:
        json.dump(rows, f, indent=2)
    if args.json:
        print(json.dumps(rows, indent=2))
        return
    order = ["ads", "bloat", "optional", "vendor", "home", "user", "system", "core"]
    for group in order:
        members = [r for r in rows if r["group"] == group]
        if not members or (group in ("system", "core") and not args.all):
            if members:
                print("%s: %d packages (left alone; --all lists them)" % (group, len(members)))
            continue
        print("\n%s (%d)" % (group, len(members)))
        for r in members:
            flags = ("tile " if r["tile"] else "") + ("" if r["state"] == "on" else r["state"])
            print("  %-55s %-10s %s" % (r["package"], flags.strip(), r["note"]))
    print("\nSaved " + path)


def cmd_plan(tv, args):
    rows = [r for r in inventory(tv) if r["state"] == "on"]
    plan = {
        "remove": [r["package"] for r in rows if r["group"] == "ads"],
        "disable": [],
        "uninstall": [],
        "settings": dict(SPEED, **PRIVACY),
        "ask": {
            "bloat": [r["package"] + "  " + r["note"] for r in rows if r["group"] == "bloat"],
            "optional": [r["package"] + "  " + r["note"] for r in rows if r["group"] == "optional"],
            "vendor": [r["package"] + "  " + r["note"] for r in rows if r["group"] == "vendor"],
            "user": [r["package"] for r in rows if r["group"] == "user" and r["tile"]],
        },
    }
    text = json.dumps(plan, indent=2)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
        print("Wrote " + args.out)
    else:
        print(text)


def cmd_apply(tv, args):
    with open(args.plan) as f:
        plan = json.load(f)
    rows = {r["package"]: r for r in inventory(tv)}
    failures = 0
    for kind in ("remove", "disable", "uninstall"):
        for pkg in plan.get(kind, []):
            row = rows.get(pkg)
            if row is None:
                print("skip %s: not on this TV" % pkg)
                continue
            if row["group"] in ("core", "home", "home-guard"):
                why = "the TV needs it" if row["group"] == "core" else "home screens change only through 'tv.py home'"
                print("REFUSED %s %s: group %s, %s" % (kind, pkg, row["group"], why))
                failures += 1
                continue
            if kind == "remove" and not row["system"]:
                print("REFUSED remove %s: not a system app, so it can't be restored; list it under 'uninstall'" % pkg)
                failures += 1
                continue
            if row["state"] != "on":
                print("skip %s: already %s" % (pkg, row["state"]))
                continue
            cmd = {"remove": "pm uninstall -k --user 0 ", "disable": "pm disable-user --user 0 ",
                   "uninstall": "pm uninstall --user 0 "}[kind] + pkg
            if args.dry_run:
                print("would run: " + cmd)
                continue
            out = tv.sh(cmd)
            ok = "Success" in out or "new state: disabled" in out
            print("%s %s %s: %s" % ("ok  " if ok else "FAIL", kind, pkg, out.splitlines()[-1] if out else ""))
            if ok:
                tv.log({"kind": kind, "package": pkg, "reversible": kind != "uninstall"})
            else:
                failures += 1
    for name, value in plan.get("settings", {}).items():
        ns, key = name.split()
        before = tv.setting(ns, key)
        if before == str(value):
            print("skip %s %s: already %s" % (ns, key, value))
            continue
        if args.dry_run:
            print("would set %s %s = %s (now %s)" % (ns, key, value, before))
            continue
        tv.sh("settings put %s %s %s" % (ns, key, value))
        after = tv.setting(ns, key)
        ok = after == str(value)
        print("%s setting %s %s = %s (was %s)" % ("ok  " if ok else "FAIL", ns, key, after, before))
        if ok:
            tv.log({"kind": "setting", "ns": ns, "key": key, "before": before, "after": str(value)})
        else:
            failures += 1
    return 1 if failures else 0


def cmd_home(tv, args):
    if args.action == "install":
        p = tv.run("install", "-r", args.arg, timeout=300)
        out = (p.stdout + p.stderr).strip()
        print(out.splitlines()[-1] if out else "")
        if "Success" not in out:
            return 1
        if not any(e["kind"] == "install" and not e.get("reverted") for e in tv.changes()):
            tv.log({"kind": "install", "package": HOME_PKG})
        return 0
    if args.action == "set":
        comp = args.arg or HOME_COMPONENT
        pkg = comp.split("/")[0]
        before = tv.current_home()
        print(tv.sh("cmd package set-home-activity --user 0 " + comp) or "set-home-activity done")
        if tv.sdk >= 29:
            tv.sh("cmd role add-role-holder --user 0 android.app.role.HOME " + pkg)
            print("Home role holder: " + tv.sh("cmd role get-role-holders --user 0 android.app.role.HOME"))
        now = tv.current_home()
        tv.log({"kind": "home", "before": before, "after": comp})
        if now and now.startswith(pkg + "/"):
            print("Home button now opens " + now)
        else:
            print("Home button still opens %s: it outranks the default setting, so it has to be "
                  "turned off with 'tv.py home stock --disable' once 'home verify' passes." % now)
        return 0
    if args.action == "stock":
        rows = {r["package"]: r for r in inventory(tv)}
        others = []
        for comp in tv.activities("android.intent.category.HOME"):
            pkg = comp.split("/")[0]
            group = rows.get(pkg, {}).get("group")
            if pkg != HOME_PKG and group != "core":
                others.append(pkg)
        others = sorted(set(others))
        guards = [p for p, r in rows.items() if r["group"] == "home-guard" and r["state"] == "on"]
        print("Other home screens: " + (", ".join(others) or "none"))
        if guards:
            print("Setup guards that can reopen setup when the stock home is off: " + ", ".join(guards))
        if not args.disable:
            return 0
        if not os.path.exists(os.path.join(tv.dir, "home-verified")) and not args.force:
            die("Run 'tv.py home verify' first: the new home must work before the stock one goes.")
        targets = others + (guards if tv.setting("secure", "user_setup_complete") == "1" else [])
        done = []
        for pkg in targets:
            out = tv.sh("pm disable-user --user 0 " + pkg)
            ok = "disabled" in out
            print("%s disable %s" % ("ok  " if ok else "FAIL", pkg))
            if ok:
                done.append(pkg)
                tv.log({"kind": "disable", "package": pkg, "reversible": True})
        if not home_button_lands(tv):
            print("Home button doesn't reach the new home; turning the stock home back on.")
            for pkg in done:
                tv.sh("pm enable --user 0 " + pkg)
            tv.save_changes([e for e in tv.changes() if not (e["kind"] == "disable" and e["package"] in done)])
            return 1
        return 0
    if args.action == "verify":
        if args.reboot:
            # Android writes package state a few seconds after a change; rebooting sooner loses it.
            print("Letting the TV save its state, then rebooting...")
            time.sleep(15)
            tv.run("reboot")
            time.sleep(5)
            tv.run("wait-for-device", timeout=300)
            for _ in range(120):
                if tv.prop("sys.boot_completed") == "1":
                    break
                time.sleep(2)
            time.sleep(8)
            print("After boot: " + str(tv.top_activity()))
        if home_button_lands(tv):
            ok = True
        elif args.reboot:
            ok = False
        else:
            # The stock home may outrank the default until it's off; check the new one at least runs.
            tv.sh("am start -W -n " + HOME_COMPONENT)
            time.sleep(2)
            top = tv.top_activity()
            ok = bool(top) and top.startswith(HOME_PKG + "/")
            print("Opened directly: %s -> %s" % (top, "runs" if ok else "FAILED to start"))
        stamp = os.path.join(tv.dir, "home-verified")
        if ok:
            with open(stamp, "w") as f:
                f.write(time.strftime("%Y-%m-%dT%H:%M:%S\n"))
        return 0 if ok else 1


def home_button_lands(tv):
    tv.sh("input keyevent KEYCODE_HOME")
    time.sleep(2)
    top = tv.top_activity()
    ok = bool(top) and top.startswith(HOME_PKG + "/")
    print("After Home press: %s -> %s" % (top, "ok" if ok else "not the new home"))
    return ok


def cmd_bench(tv, args):
    mem = dict(re.findall(r"(\w+):\s+(\d+) kB", tv.sh("cat /proc/meminfo")))
    procs = len(tv.sh("ps -A -o NAME").splitlines()) - 1
    home = tv.current_home()
    times = []
    if home:
        for _ in range(3):
            # Leave home first: the system restarts a home screen that is killed while on top.
            tv.sh("am start -a android.settings.SETTINGS")
            time.sleep(2)
            tv.sh("am force-stop " + home.split("/")[0])
            time.sleep(1)
            out = tv.sh("am start -W -a android.intent.action.MAIN -c android.intent.category.HOME")
            m = re.search(r"TotalTime: (\d+)", out)
            if m and int(m.group(1)) > 0:
                times.append(int(m.group(1)))
            time.sleep(1.5)
    df = tv.sh("df -k /data").splitlines()
    free_mb = int(df[-1].split()[3]) // 1024 if len(df) > 1 else None
    enabled = len(tv.sh("pm list packages -e").splitlines())
    sample = {"label": args.label, "time": time.strftime("%Y-%m-%dT%H:%M:%S"), "home": home,
              "ram_available_mb": int(mem.get("MemAvailable", 0)) // 1024, "processes": procs,
              "home_cold_start_ms": sorted(times)[len(times) // 2] if times else None,
              "storage_free_mb": free_mb, "enabled_packages": enabled}
    path = os.path.join(tv.dir, "bench.jsonl")
    with open(path, "a") as f:
        f.write(json.dumps(sample) + "\n")
    with open(path) as f:
        samples = [json.loads(line) for line in f if line.strip()]
    print(json.dumps(sample, indent=2))
    if len(samples) > 1:
        first = samples[0]
        print("\nChange since '%s':" % first["label"])
        for k in ("ram_available_mb", "processes", "home_cold_start_ms", "storage_free_mb", "enabled_packages"):
            if first.get(k) is not None and sample.get(k) is not None:
                print("  %-20s %8s -> %-8s (%+d)" % (k, first[k], sample[k], sample[k] - first[k]))


def cmd_optimize(tv, args):
    start = time.time()
    print("Compiling apps ahead of time (can take several minutes)...")
    out = tv.sh("cmd package bg-dexopt-job", timeout=1800)
    print(out.splitlines()[-1] if out else "done")
    print(tv.sh("pm trim-caches 999G") or "caches trimmed")
    tv.sh("am kill-all")
    print("Done in %ds" % (time.time() - start))


def ui_nodes(tv):
    tv.sh("uiautomator dump /sdcard/revamp-ui.xml")
    xml = tv.run("exec-out", "cat /sdcard/revamp-ui.xml").stdout
    if "<hierarchy" not in xml:
        die("UI dump failed: " + xml[:200])
    # A tiny tokenizer instead of an XML library: some Python builds ship without a working expat.
    nodes, stack = [], []
    for m in re.finditer(r"<node\b([^>]*?)(/?)>|</node>", xml):
        if m.group(0) == "</node>":
            if stack:
                stack.pop()
            continue
        a = {k: html.unescape(v) for k, v in re.findall(r'([\w-]+)="([^"]*)"', m.group(1))}
        focused = a.get("focused") == "true"
        in_focus = focused or (stack[-1] if stack else False)
        nodes.append({"text": a.get("text", ""), "desc": a.get("content-desc", ""),
                      "id": a.get("resource-id", ""), "focused": focused, "in_focus": in_focus,
                      "checked": a.get("checked") == "true", "checkable": a.get("checkable") == "true",
                      "focusable": a.get("focusable") == "true" or a.get("clickable") == "true",
                      "bounds": [int(n) for n in re.findall(r"\d+", a.get("bounds", "[0,0][0,0]"))]})
        if not m.group(2):
            stack.append(in_focus)
    return nodes


def cmd_ui(tv, args):
    if args.action == "dump":
        for n in ui_nodes(tv):
            label = n["text"] or n["desc"]
            if not label and not n["focused"]:
                continue
            mark = "*" if n["in_focus"] else " "
            state = " [on]" if n["checkable"] and n["checked"] else " [off]" if n["checkable"] else ""
            print("%s %-60s%s %s" % (mark, label[:60], state, n["bounds"]))
        return 0
    if args.action == "key":
        codes = []
        for k in args.rest:
            name, _, times = k.upper().partition("*")
            code = KEYS.get(name) or (int(name) if name.isdigit() else None)
            if code is None:
                die("Unknown key " + k + ". Known: " + ", ".join(KEYS))
            codes += [str(code)] * (int(times) if times else 1)
        for code in codes:
            tv.sh("input keyevent " + code)
            time.sleep(0.25)
        return 0
    if args.action == "open":
        target = args.rest[0]
        flag = "-n" if "/" in target else "-a"
        print(tv.sh("am start %s %s" % (flag, target)))
        return 0
    if args.action == "focus":
        want = " ".join(args.rest).lower()
        last = None
        for _ in range(40):
            nodes = ui_nodes(tv)
            match = [n for n in nodes if want in (n["text"] + " " + n["desc"]).lower()]
            # Prefer something that can take focus (a button) over a title with the same words.
            match.sort(key=lambda n: not n["focusable"])
            focus = next((n for n in nodes if n["focused"]), None)
            if match and any(n["in_focus"] for n in match):
                print("Focused: " + (match[0]["text"] or match[0]["desc"]))
                return 0
            if not focus:
                tv.sh("input keyevent 20")
                continue
            fx, fy = (focus["bounds"][0] + focus["bounds"][2]) / 2, (focus["bounds"][1] + focus["bounds"][3]) / 2
            if match:
                t = match[0]["bounds"]
                tx, ty = (t[0] + t[2]) / 2, (t[1] + t[3]) / 2
                dx, dy = tx - fx, ty - fy
                fb = focus["bounds"]
                if fb[0] <= tx <= fb[2]:
                    horizontal = False  # same column (a wide row or list): move vertically
                elif fb[1] <= ty <= fb[3]:
                    horizontal = True  # same row: move sideways
                else:
                    horizontal = abs(dx) > abs(dy)
                key = (22 if dx > 0 else 21) if horizontal else (20 if dy > 0 else 19)
            else:
                key = 20  # not on screen yet: scroll the list down
            # A list that scrolls keeps focus in place, so compare the whole screen, not the focus.
            screen = [(n["text"], n["in_focus"], tuple(n["bounds"])) for n in nodes]
            if screen == last and not match:
                break
            last = screen
            tv.sh("input keyevent %d" % key)
            time.sleep(0.3)
        die("Couldn't reach '%s'. Run 'tv.py ui dump' and navigate with 'tv.py ui key'." % want)


def cmd_shot(tv, args):
    p = subprocess.run([tv.adb, "-s", tv.serial, "exec-out", "screencap", "-p"], capture_output=True)
    with open(args.file, "wb") as f:
        f.write(p.stdout)
    print("Saved " + args.file)


def cmd_log(tv, args):
    for e in tv.changes():
        print(json.dumps(e))


def cmd_restore(tv, args):
    entries = tv.changes()
    seen = set()
    for e in reversed(entries):
        if e.get("reverted"):
            continue
        kind = e["kind"]
        if kind in ("home", "install"):
            # Only the oldest home change holds the original home; one uninstall is enough.
            if kind == "install" and kind in seen:
                e["reverted"] = True
                continue
            seen.add(kind)
        if kind == "remove":
            cmd = ("cmd package install-existing --user 0 " if tv.sdk >= 26 else "pm install-existing ") + e["package"]
        elif kind == "disable":
            cmd = "pm enable --user 0 " + e["package"]
        elif kind == "setting":
            cmd = ("settings delete %s %s" % (e["ns"], e["key"]) if e["before"] is None
                   else "settings put %s %s %s" % (e["ns"], e["key"], e["before"]))
        elif kind == "home":
            if not e.get("before"):
                continue
            cmd = "cmd package set-home-activity --user 0 " + e["before"]
            if tv.sdk >= 29:
                cmd += "; cmd role add-role-holder --user 0 android.app.role.HOME " + e["before"].split("/")[0]
        elif kind == "install":
            if not args.remove_home:
                continue
            cmd = "pm uninstall " + e["package"]
        else:
            print("can't undo %s %s: not reversible" % (kind, e.get("package", "")))
            continue
        if args.dry_run:
            print("would run: " + cmd)
            continue
        out = tv.sh(cmd)
        print("%s  (%s)" % (cmd, out.splitlines()[-1] if out else "ok"))
        e["reverted"] = True
    if not args.dry_run:
        tv.save_changes(entries)
        stamp = os.path.join(tv.dir, "home-verified")
        if os.path.exists(stamp):
            os.remove(stamp)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-s", "--serial")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("connect"); p.add_argument("host")
    p = sub.add_parser("pair"); p.add_argument("target"); p.add_argument("code")
    sub.add_parser("info")
    p = sub.add_parser("packages"); p.add_argument("--json", action="store_true"); p.add_argument("--all", action="store_true")
    p = sub.add_parser("plan"); p.add_argument("--out")
    p = sub.add_parser("apply"); p.add_argument("plan"); p.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("home")
    p.add_argument("action", choices=["install", "set", "stock", "verify"])
    p.add_argument("arg", nargs="?")
    p.add_argument("--disable", action="store_true")
    p.add_argument("--force", action="store_true")
    p.add_argument("--reboot", action="store_true")
    p = sub.add_parser("bench"); p.add_argument("label")
    sub.add_parser("optimize")
    p = sub.add_parser("ui"); p.add_argument("action", choices=["dump", "key", "focus", "open"]); p.add_argument("rest", nargs="*")
    p = sub.add_parser("shot"); p.add_argument("file")
    sub.add_parser("log")
    p = sub.add_parser("restore"); p.add_argument("--remove-home", action="store_true"); p.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.cmd == "connect":
        return cmd_connect(args)
    if args.cmd == "pair":
        return cmd_pair(args)
    tv = TV(args.serial)
    handler = globals()["cmd_" + args.cmd]
    return handler(tv, args) or 0


if __name__ == "__main__":
    sys.exit(main())
