# Simulator Screenshot Capture

Use this reference when the requested App Store work includes producing listing screenshots from an iOS Simulator.

## Contents

1. Plan the screenshot set
2. Select and boot a simulator
3. Build, install, and launch
4. Normalize presentation state
5. Drive representative app states
6. Capture and inspect
7. Validate and upload
8. Restore simulator state

## 1. Plan the screenshot set

- Read the app flow and identify the states that best communicate its primary jobs and differentiators.
- Prefer real in-flow screens. Exclude launch, onboarding, sign-in, permission, placeholder, empty, and debug screens unless one is central to the product.
- Decide the target locale, display family, orientation, appearance, content size, and screenshot order before opening Simulator.
- Check Apple's current screenshot specifications. Do not infer an App Store display slot from a simulator's marketing name alone.
- Record one intended message and one reproducible source state for each screenshot.

Finish when the screenshot plan is ordered and every state can be reached without an unapproved production-side effect.

## 2. Select and boot a simulator

List available devices:

```bash
xcrun simctl list devices available
```

Choose a simulator expected to produce one of Apple's currently accepted pixel sizes. Prefer a UDID over a device name so duplicate simulator names cannot select the wrong target.

```bash
SCREENSHOT_DEVICE_ID="<simulator-udid>"
xcrun simctl bootstatus "$SCREENSHOT_DEVICE_ID" -b
```

Verify the first captured file's actual dimensions before producing the full set. If they do not match the target App Store slot, select another simulator.

## 3. Build, install, and launch

Use the repository's documented project or workspace command. A project build has this shape:

```bash
SCREENSHOT_SCHEME="<scheme>"
xcodebuild \
  -project "<path-to-project>.xcodeproj" \
  -scheme "$SCREENSHOT_SCHEME" \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$SCREENSHOT_DEVICE_ID" \
  build
```

For a workspace, replace `-project` with `-workspace`.

Read `TARGET_BUILD_DIR`, `WRAPPER_NAME`, and `PRODUCT_BUNDLE_IDENTIFIER` from `xcodebuild -showBuildSettings`. Join the first two values to obtain the built `.app` path, then install and launch it:

```bash
SCREENSHOT_APP_PATH="<target-build-dir>/<wrapper-name>"
SCREENSHOT_BUNDLE_ID="<product-bundle-identifier>"
xcrun simctl install "$SCREENSHOT_DEVICE_ID" "$SCREENSHOT_APP_PATH"
xcrun simctl launch \
  --terminate-running-process \
  "$SCREENSHOT_DEVICE_ID" \
  "$SCREENSHOT_BUNDLE_ID"
```

Avoid hard-coded DerivedData paths. Prefer an existing screenshot scheme, UI-test fixture, launch argument, or debug seed path when the repository provides one.

## 4. Normalize presentation state

Set the intended appearance and a standard content size:

```bash
xcrun simctl ui "$SCREENSHOT_DEVICE_ID" appearance light
xcrun simctl ui "$SCREENSHOT_DEVICE_ID" content_size large
```

Normalize the status bar when the app displays it:

```bash
xcrun simctl status_bar "$SCREENSHOT_DEVICE_ID" override \
  --time "9:41" \
  --dataNetwork wifi \
  --wifiMode active \
  --wifiBars 3 \
  --cellularMode active \
  --cellularBars 4 \
  --batteryState charged \
  --batteryLevel 100
```

Wait for launch animations, keyboard coaching, permission prompts, notifications, and other system overlays to clear before capture.

## 5. Drive representative app states

- Prefer deterministic UI tests, launch arguments, local fixtures, or debug seed data.
- Otherwise control Simulator directly and navigate the real app flow.
- Use realistic, non-sensitive sample data that makes the screen feel complete.
- Keep production services untouched. Use a local or mock path when reaching a screenshot state would otherwise create external data or spend money.
- Dismiss the keyboard unless text entry is the capability being shown.
- Capture loading or progress states only when they communicate meaningful product value.

For every planned screenshot, stop at a stable state and confirm that its primary action and content are visible.

## 6. Capture and inspect

Create a stable directory organized by locale and display family:

```bash
SCREENSHOT_OUTPUT_DIR="<repo>/app-store-screenshots/<locale>/<display-family>"
mkdir -p "$SCREENSHOT_OUTPUT_DIR"
```

Capture an opaque JPEG from the unmasked framebuffer. Simulator PNG output can retain an alpha channel even with an ignored mask, while App Store screenshots cannot contain transparency.

```bash
xcrun simctl io "$SCREENSHOT_DEVICE_ID" screenshot \
  --type=jpeg \
  --mask=ignored \
  "$SCREENSHOT_OUTPUT_DIR/01-primary-feature.jpg"
```

Use `--mask=black` only when the hardware mask is intentionally part of the composition.

After every capture:

- Inspect the image visually before advancing the app.
- Confirm the expected screen, copy, sample data, orientation, status bar, and pixel dimensions.
- Reject screenshots containing system overlays, accidental personal data, debug UI, clipped content, blank regions, or unintended keyboards.
- Name the accepted file immediately with its final two-digit order and descriptive slug.

## 7. Validate and upload

Run the bundled validator against the completed directory:

```bash
scripts/validate_app_store_assets.py \
  --screenshots "$SCREENSHOT_OUTPUT_DIR"
```

Recapture any file with invalid dimensions, transparency, corruption, or visual defects. Keep the final directory limited to the screenshots intended for upload.

When the requested scope includes listing media or App Store submission, continue directly to the skill's media-upload step. Upload the validated files in filename order, then verify:

- Screenshot count and order.
- Locale and display family.
- Filenames and file sizes.
- Asset-delivery state and errors.
- The rendered Media Manager result.

Local capture is not complete for submission work until the validated set is present in App Store Connect.

## 8. Restore simulator state

Clear temporary status-bar overrides:

```bash
xcrun simctl status_bar "$SCREENSHOT_DEVICE_ID" clear
```

Preserve an already-running simulator for the user. Shut down only a simulator that this workflow booted and no longer needs.
