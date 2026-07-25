# App Store Connect Media Upload

Use this reference when the App Store Connect file chooser is unreliable or when repeatable screenshot upload is part of the requested scope.

Apple documents the same four-stage asset workflow for its public API: reserve, upload, commit, and verify. Prefer the public API at `https://api.appstoreconnect.apple.com/v1` when the user has an established API-key workflow. The `/iris/v1` examples below are an authenticated App Store Connect web-session fallback; they are not the stable public API and can change without notice.

## Safety boundary

- Confirm the target app, version, locale, display family, filenames, and order before creating or replacing resources.
- Query first and reuse the correct screenshot set rather than creating duplicates.
- Do not delete or replace existing screenshots unless the user requested that change.
- Keep pre-signed storage URLs and authenticated responses out of logs and committed files.

## Connect to an authenticated browser session

Use the Chrome control skill when the existing App Store Connect login is needed. Navigate to the target app version and Media Manager, then test the page context with a read-only evaluation:

```js
await cdp.send("Runtime.evaluate", {
  expression: "location.href",
  returnByValue: true
});
```

Authenticated web-session calls use relative `/iris/v1` URLs with `credentials: "include"`.

## Discover identifiers

Discover the editable iOS version and its localizations:

```js
await fetch(
  "/iris/v1/apps/<app-id>/appStoreVersions?include=appStoreVersionLocalizations&limit[appStoreVersionLocalizations]=2000",
  { credentials: "include", headers: { Accept: "application/json" } }
).then(r => r.json());
```

Select the `IOS` version matching the requested version string and an editable state. Select the localization matching the requested locale; never assume the first included localization is correct.

Query existing screenshot sets:

```js
await fetch(
  "/iris/v1/appScreenshotSets?include=appScreenshots&filter[appStoreVersionLocalization]=<localization-id>",
  { credentials: "include", headers: { Accept: "application/json" } }
).then(r => r.json());
```

Map the requested display family to the API's current `screenshotDisplayType` by inspecting existing resources or the current API schema. UI labels and enum names can differ.

## Create a missing screenshot set

```js
const body = {
  data: {
    type: "appScreenshotSets",
    attributes: { screenshotDisplayType: "<current-display-type>" },
    relationships: {
      appStoreVersionLocalization: {
        data: { type: "appStoreVersionLocalizations", id: "<localization-id>" }
      }
    }
  }
};

await fetch("/iris/v1/appScreenshotSets", {
  method: "POST",
  credentials: "include",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify(body)
}).then(r => r.json());
```

## Upload screenshots

Repeat reservation and storage upload for each validated file, then commit every reservation.

### 1. Reserve

```js
const reservationBody = {
  data: {
    type: "appScreenshots",
    attributes: {
      fileName: "<validated-file-name>.<validated-extension>",
      fileSize: <validated-byte-count>
    },
    relationships: {
      appScreenshotSet: {
        data: { type: "appScreenshotSets", id: "<screenshot-set-id>" }
      }
    }
  }
};

const reservation = await fetch("/iris/v1/appScreenshots", {
  method: "POST",
  credentials: "include",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify(reservationBody)
}).then(r => r.json());
```

Require a screenshot id and at least one upload operation before continuing.

### 2. Upload every part

Run this in a trusted local Node context that can read the validated file. The returned storage URLs are pre-signed and do not use App Store Connect cookies.

```js
const fs = await import("node:fs/promises");
const bytes = await fs.readFile("<absolute-path-to-validated-file>");

for (const operation of reservation.data.attributes.uploadOperations) {
  const part = bytes.subarray(
    operation.offset,
    operation.offset + operation.length
  );
  const headers = Object.fromEntries(
    (operation.requestHeaders || []).map(header => [header.name, header.value])
  );
  const response = await fetch(operation.url, {
    method: operation.method,
    headers,
    body: part
  });
  if (!response.ok) {
    throw new Error(`upload failed: ${response.status} ${await response.text()}`);
  }
}
```

### 3. Commit

Use the file's lowercase hexadecimal MD5 value as `sourceFileChecksum`:

```js
await fetch("/iris/v1/appScreenshots/<screenshot-id>", {
  method: "PATCH",
  credentials: "include",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify({
    data: {
      type: "appScreenshots",
      id: "<screenshot-id>",
      attributes: {
        uploaded: true,
        sourceFileChecksum: "<md5-hex>"
      }
    }
  })
}).then(r => r.json());
```

A storage upload without this commit remains awaiting upload.

### 4. Apply order

Include every screenshot that should remain in the set:

```js
await fetch(
  "/iris/v1/appScreenshotSets/<screenshot-set-id>/relationships/appScreenshots",
  {
    method: "PATCH",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        { type: "appScreenshots", id: "<first-id>" },
        { type: "appScreenshots", id: "<second-id>" }
      ]
    })
  }
);
```

## Verify

Query the screenshot set again and check all of the following:

- The set belongs to the requested version localization and display family.
- The screenshot count and relationship order match the plan.
- Filenames and file sizes match the validated local files.
- Each asset-delivery error list is empty.
- Each asset has reached upload-complete or a later processing state.

Refresh Media Manager and visually confirm the same result.

## Public API reference

- [Uploading Assets to App Store Connect](https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect)
- [App Screenshots](https://developer.apple.com/documentation/appstoreconnectapi/app-screenshots)
