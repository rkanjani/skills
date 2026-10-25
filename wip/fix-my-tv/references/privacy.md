# Privacy: ads, tracking and data collection

Three layers, from most to least reliable. Do all three.

## 1. Remove the collectors

The `ads` group in `packages.tsv` (telemetry, ad services, viewing-data collectors like Samba TV and Alphonso) is in the default plan. Removal is `pm uninstall -k --user 0`, reversible with `tv.py restore`. Some TVs refuse to remove a module (`com.google.mainline.telemetry` is common); report it and move on.

Review the `vendor` group with the user. A brand service whose name says analytics, ACR, viewing info, interactive, partner, ads, or recommendation is usually a collector; one whose name says input, HDMI, CEC, tuner, audio, picture, panel, or remote is usually needed. When unsure, leave it.

## 2. Settings over ADB

In the default plan:

| Setting | Value | Why |
|---|---|---|
| `global wifi_scan_always_enabled` | 0 | stops Wi-Fi scanning for location when Wi-Fi is off |
| `global ble_scan_always_enabled` | 0 | stops Bluetooth scanning for location |

Ask before adding:

| Setting | Value | Trade-off |
|---|---|---|
| `global private_dns_mode` + `global private_dns_specifier` | `hostname` + a filtering resolver such as `dns.adguard-dns.com` | blocks ad and tracking domains for every app on the TV, but some ad-supported apps (Pluto TV, Tubi) can stall, and the resolver sees the TV's lookups |
| `secure screensaver_enabled` | 0 | no screensaver, so no Ambient mode suggestions; the screen stays on until the sleep timer |

## 3. Toggles that only exist in the TV's own menus

Drive these with `tv.py ui`: `ui open ACTION` opens a screen, `ui focus TEXT` moves focus to an item, `ui key OK` selects it, and `ui dump` confirms the new state. Take a screenshot when a dump is ambiguous.

- **Advertising ID.** `tv.py ui open com.google.android.gms.settings.ADS_PRIVACY`, then **Delete advertising ID** (or, on older builds, turn on **Opt out of Ads Personalization**). Falls back to Settings > Privacy > Ads.
- **Usage & diagnostics.** Settings > Privacy > Usage & diagnostics (Google TV), or Settings > Device Preferences > Usage & Diagnostics (Android TV). Turn it off.
- **Google TV app personalization.** Settings > Accounts & sign in > your account > Google Assistant and personal results. Only matters if the stock home stays.
- **Brand viewing data (ACR).** Search the brand's own settings for viewing information, Samba Interactive TV, Smart TV Experience, Interactive TV, Live Plus, or Viewing data, and turn each off. `tv.py ui dump` on each settings page shows the wording.
- **Location** (only if the user wants it off). Settings > Privacy > Location.

A toggle counts as done when a fresh `ui dump` shows its new state. These menu changes aren't in the change log; tell the user which ones you changed so they can flip them back.
