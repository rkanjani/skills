---
name: fix-my-tv
description: Fix an Android TV or Google TV from a laptop over ADB. Finds the TV on the network, removes bloatware and preinstalled apps the owner doesn't want, turns off ad tracking and data collection, speeds it up, and replaces the home screen with a fast, beautiful Apple TV style launcher. Use when someone wants their Android TV or Google TV debloated, de-tracked, faster, or given a cleaner home screen, or wants those changes undone.
---

# Fix my TV (work in progress)

The outcome is a TV that boots to a clean, fast home screen, runs only what its owner uses, and sends as little data as it can, with every change reversible from the laptop.

Two rules hold throughout:

- **One plan, approved once.** Nothing on the TV changes until the owner has seen and approved the whole plan. After that, carry it out without asking again; ask only about something the plan didn't cover.
- **Every change is in the change log.** Make changes only through `scripts/tv.py`, which records each one in `~/.config/fix-my-tv/devices/<serial>/changes.jsonl` so `tv.py restore` can undo it. Menu toggles changed with `tv.py ui` are the exception; list them in the hand-off.

All scripts are in `scripts/`; run them with `python3` from the skill folder.

## Workflow

1. **Get the tools.** `adb version` and `python3 --version` work. If adb is missing, install it ([references/connect.md](references/connect.md)). Done when both print versions.

2. **Find the TV.** Run `find_tv.py`. With several TVs, ask which one. When ADB is off, walk the owner through [references/connect.md](references/connect.md) one step at a time, rerunning `find_tv.py` between steps, then `tv.py connect IP` (or `tv.py pair` for wireless debugging). Done when `tv.py info` prints the model, Android version and current home.

3. **Take the before picture.** `tv.py packages` (saves the full inventory), `tv.py bench before`, and `tv.py shot` of the current home screen, which you look at. Done when the bench sample and inventory are saved.

4. **Draft the plan.** `tv.py plan --out <state dir>/plan.json` starts it: ads and telemetry removals, privacy and speed settings, and an `ask` list. Then show the owner, in one message:
   - **Removing**: the `ads` group, by plain name.
   - **Your call**: every `bloat` and `optional` app on the TV by plain name with its note (`tile` marks apps with a home-screen tile), plus `vendor` services that look like collectors (see [references/privacy.md](references/privacy.md)). Ask which they don't use.
   - **Settings**: speed (animations at 0.5x) and privacy, plus the ask-first rows in privacy.md.
   - **Home screen**: the new home, and what turning off the stock home costs ([references/home.md](references/home.md)).
   - **Menu toggles**: advertising ID, usage and diagnostics, the brand's viewing-data setting.

   Move what they pick into `remove` (system apps), `uninstall` (apps they installed; permanent), or `disable`, and delete the `ask` key. Done when the owner has approved the final plan.

5. **Swap the home screen.** Build with `scripts/build_home.sh` (needs an Android SDK and JDK; see home.md), then `tv.py home install <apk>`, open it with `tv.py ui open app.fixmytv.home/.HomeActivity`, and look at a `tv.py shot`: tiles show the owner's apps with their art, the shelf glows, focus moves with `tv.py ui key RIGHT DOWN`. Then `tv.py home set`, `tv.py home verify`, `tv.py home stock --disable` (it checks the Home button and turns the stock home back on if it misses), and `tv.py home verify --reboot`. Done when the reboot check lands on `app.fixmytv.home`. If it doesn't, follow "If something goes wrong" in home.md before anything else.

6. **Apply the plan.** `tv.py apply plan.json --dry-run`, then `tv.py apply plan.json`. Done when every line reads `ok` or `skip`. A `FAIL` or `REFUSED` is reported to the owner, never forced.

7. **Flip the menu toggles.** For each approved toggle in privacy.md: `tv.py ui open`, `tv.py ui focus`, `tv.py ui key OK`, confirm. Done when a fresh `tv.py ui dump` shows every toggle in its new state, or you've told the owner which one their TV doesn't have.

8. **Speed up and measure.** `tv.py optimize`, `tv.py home verify --reboot`, `tv.py bench after`, and a final `tv.py shot` you look at. Done when the bench prints the before and after comparison.

9. **Hand off.** Tell the owner:
   - What was removed, turned off and changed, and the before and after numbers (free memory, processes, home start time, storage).
   - The menu toggles you changed.
   - How to use the home screen: hold OK or press Menu on an app to move or hide it.
   - How to undo: `python3 scripts/tv.py restore` (add `--remove-home` to go fully back to stock), which needs debugging on.
   - That a system update can bring removed apps back; running the skill again picks them up.

## Rules for the TV

- Packages in the `core` group never change, and home screens change only through `tv.py home`; `apply` refuses both.
- When unsure what a package does, leave it and say so. A slower TV is better than a broken one.
- Prefer `remove` (reversible) over `disable` for system apps; use `disable` for apps that come back after updates.
- After the stock home is off, every reboot check must land on the new home before you continue.
