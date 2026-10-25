# Connecting to the TV

## Tools on the computer

- **adb**: `brew install --cask android-platform-tools` on macOS, `sudo apt install adb` on Debian or Ubuntu, or the platform-tools zip from developer.android.com. An existing Android SDK at `~/Library/Android/sdk` or `~/Android/Sdk` works too; `tv.py` finds it.
- **Python 3.8 or later** for the scripts. Standard library only.

## Turning on debugging (the user does this with the remote)

1. Open developer options. Settings > System > About (Google TV), or Settings > Device Preferences > About (Android TV). Select **Android TV OS build** (or **Build**) seven times until it says you're a developer. Some TVs ask for the PIN.
2. In Settings > System > Developer options (or Device Preferences > Developer options), turn on one of:
   - **USB debugging**, or **Network debugging** when it's listed. Most TVs then accept ADB on port 5555 over the network.
   - **Wireless debugging** (Android 11 and later, some Google TV devices). It shows an IP and port. Choose **Pair device with pairing code**, then run `tv.py pair IP:PAIRPORT CODE` and `tv.py connect IP:PORT` with the port shown on the wireless debugging screen, not the pairing port.
3. Run `tv.py connect IP`. The TV shows **Allow debugging?** Tick **Always allow from this computer** and choose **Allow**.

Rerun `find_tv.py` after each step: it reports ADB as reachable once the TV listens.

## When it doesn't connect

| Symptom | Cause and fix |
|---|---|
| `find_tv.py` finds nothing | TV and computer on different networks or a guest network that isolates clients; put both on the same network. Some routers block mDNS, so the port sweep is the fallback; it only covers the computer's /24. |
| `connection refused` on 5555 | Debugging is off, or this TV only does wireless debugging. Toggle it off and on. Some TVs close port 5555 after every reboot until debugging is toggled again. |
| `unauthorized` | The prompt was dismissed or timed out. Run `adb kill-server`, connect again, and watch the TV. |
| `offline` | Run `adb disconnect IP:5555` and connect again. |
| Wireless debugging port changed | It changes on every toggle and reboot. Read it from the TV again, or from `find_tv.py`, which reads the `_adb-tls-connect` service. |
| Fire TV | Fire OS is not Android TV. `find_tv.py` won't list it as a TV and `references/packages.tsv` has no Amazon rules; stop and say so. |

Leave debugging on until the hand-off; `tv.py restore` needs it. Afterwards the user can turn it off, and `tv.py` keeps working once it's turned back on.
