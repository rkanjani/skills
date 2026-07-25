---
name: app-store-submit
description: Prepare iOS apps for App Store Connect. Use when Codex needs to inspect release readiness, build and drive an app in iOS Simulator to capture App Store screenshots, validate icons or screenshots, upload listing media, complete metadata, diagnose submission blockers, submit an app for review, or verify App Store Connect state.
---

# App Store Submit

Drive an iOS App Store release from repository inspection to a verified App Store Connect state. Treat metadata as product data: discover it from the app, code, policies, and user instead of inferring it from examples.

## Workflow

1. Establish scope and authority.
   - Determine whether the user wants readiness work, media upload, metadata changes, build upload, or App Review submission.
   - Treat production uploads, metadata publication, pricing changes, privacy publication, and review submission as distinct write actions.
   - Submit for App Review only when the user explicitly requests that final action.
   - Finish when the requested boundary and the actions still awaiting authorization are explicit.

2. Inspect the release setup.
   - Read repository instructions and release documentation.
   - Identify the Xcode project or workspace, release scheme, bundle identifier, version, build number, deployment targets, asset catalog or Icon Composer source, and upload tooling.
   - Inspect the app's implemented features, account model, data flows, third-party SDKs, entitlements, encryption use, and public support/privacy pages before drafting listing answers.
   - Finish when every App Store value has a source or is recorded as an unresolved input.

3. Verify the release build and icon.
   - Use the repository's existing build and archive workflow.
   - Run `scripts/validate_app_store_assets.py --project-root <repo>` for a PNG asset-catalog icon, or pass `--icon <path-to-1024-png>`.
   - For Icon Composer or layered icons, verify the archived build with Xcode's validation tooling; the asset validator does not model layered icon output.
   - Finish when the release build is valid or every build blocker is reported with its evidence.

4. Plan and capture listing screenshots.
   - Read `references/simulator-screenshot-capture.md` when screenshots must be produced from an iOS Simulator.
   - Choose real product states that communicate the app's primary jobs and differentiators.
   - Prefer in-flow screens over launch, sign-in, permission, placeholder, or empty states unless one of those is itself a product capability.
   - Keep device family, orientation, language, appearance, and status-bar treatment consistent within each screenshot set.
   - Check Apple's current screenshot specification before capture; do not assume dimensions from an older release.
   - Save ordered assets in a stable directory using descriptive names such as `01-primary-feature.jpg`.
   - Finish when each screenshot has a message, source state, target device family, order, and validated local file.

5. Validate listing assets.
   - Run `scripts/validate_app_store_assets.py --screenshots <dir>`.
   - Resolve invalid dimensions, transparency, corrupt image data, missing files, duplicate frames, and accidental sensitive data before upload.
   - Finish when every intended asset passes deterministic validation and a visual inspection.

6. Upload media.
   - When the requested scope includes App Store listing media or submission, continue from simulator capture to upload. Do not stop after creating local files.
   - Prefer the App Store Connect UI when it is reliable.
   - Prefer Apple's documented App Store Connect API for repeatable automation when API credentials and an existing workflow are available.
   - Use the authenticated browser-session fallback in `references/app-store-connect-media-api.md` only when the UI is blocked and the user is already signed in.
   - Verify upload completion, processing state, filename, order, locale, and display family after any route.
   - Finish when App Store Connect shows the intended media set with no asset-delivery errors.

7. Complete listing and submission prerequisites.
   - Read `references/app-store-connect-submission-api.md` before changing listing, privacy, pricing, review, or submission resources.
   - Derive description, keywords, categories, age rating, privacy declarations, content rights, encryption answers, pricing, release mode, and review notes from verified facts.
   - Request only inputs that cannot be discovered safely, such as legal owner text or real App Review contact details.
   - Use public, stable support and privacy URLs. Create them only when the user has authorized that additional publishing work.
   - Finish when App Store Connect reports the version ready for review or every remaining validation error has an owner and next action.

8. Submit and verify.
   - Immediately before submission, restate the app, platform, version, build, release mode, and included review items.
   - Submit only after explicit user authorization.
   - Re-query or refresh App Store Connect and record the resulting version and submission statuses.
   - Finish when the resulting production state is confirmed, including any inherited media slots or Apple-side processing still underway.

## References

- Read `references/simulator-screenshot-capture.md` when building, installing, driving, and capturing the app in iOS Simulator.
- Read `references/app-store-connect-media-api.md` for screenshot-set discovery, upload reservation, storage upload, commit, ordering, and verification.
- Read `references/app-store-connect-submission-api.md` for listing metadata, categories, age rating, privacy, pricing, review details, and review submission.

## Script

- `scripts/validate_app_store_assets.py` validates PNG or JPEG screenshot integrity, transparency, current iPhone screenshot dimensions, and a 1024×1024 PNG App Store icon. It emits MD5 and SHA-256 values for upload commits and audit trails.

## Current Apple references

- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Upload app previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
- [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/)
- [Submit an app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/)
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
