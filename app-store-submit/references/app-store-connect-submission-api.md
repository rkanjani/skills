# App Store Connect Submission

Use this reference after media is ready and the requested scope includes listing metadata, compliance declarations, pricing, review details, or App Review submission.

Prefer Apple's documented App Store Connect API when an API-key workflow already exists. The relative `/iris/v1` examples below are an authenticated App Store Connect web-session fallback and can change without notice.

## Safety boundary

- Read the current production resources before writing.
- Build an app-facts worksheet from the repository, binary, backend, SDK manifests, privacy policy, business model, and user-provided legal/contact information.
- Represent unresolved facts as blockers. Never convert an example into an app declaration.
- Treat publishing privacy answers, changing pricing or availability, and submitting for review as consequential writes.
- Submit only after the user explicitly authorizes the exact app, platform, version, build, release mode, and review items.

## Request helper

Run web-session requests from an authenticated App Store Connect page:

```js
async function req(method, url, body) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, ok: response.ok, json, text };
}
```

Stop on any non-success response and preserve its structured validation errors.

## Discover current resources

Resolve the target resource ids rather than reusing ids from a previous release:

```js
await req(
  "GET",
  "/iris/v1/apps/<app-id>/appStoreVersions?include=appStoreVersionLocalizations&limit[appStoreVersionLocalizations]=2000"
);
await req(
  "GET",
  "/iris/v1/apps/<app-id>/appInfos?include=ageRatingDeclaration,primaryCategory,primarySubcategoryOne,primarySubcategoryTwo"
);
```

Also query builds, review details, pricing, privacy state, and existing review submissions as required by the requested branch.

## Listing metadata

Patch app-level localization fields with copy and URLs approved for the target locale:

```js
await req("PATCH", "/iris/v1/appInfoLocalizations/<app-info-localization-id>", {
  data: {
    type: "appInfoLocalizations",
    id: "<app-info-localization-id>",
    attributes: {
      subtitle: "<approved-subtitle>",
      privacyPolicyUrl: "<public-privacy-policy-url>"
    }
  }
});
```

Patch version-localized fields:

```js
await req(
  "PATCH",
  "/iris/v1/appStoreVersionLocalizations/<version-localization-id>",
  {
    data: {
      type: "appStoreVersionLocalizations",
      id: "<version-localization-id>",
      attributes: {
        description: "<approved-description>",
        keywords: "<approved-comma-separated-keywords>",
        promotionalText: "<approved-promotional-text-or-null>",
        supportUrl: "<public-support-url>",
        marketingUrl: "<public-marketing-url-or-null>"
      }
    }
  }
);
```

Only include `whatsNew` when the target version permits it and the release actually has approved release notes.

Patch version attributes and assign the verified build:

```js
await req("PATCH", "/iris/v1/appStoreVersions/<version-id>", {
  data: {
    type: "appStoreVersions",
    id: "<version-id>",
    attributes: {
      copyright: "© <current-year> <legal-owner>",
      releaseType: "<verified-release-mode>",
      usesIdfa: <verified-boolean>
    }
  }
});

await req(
  "PATCH",
  "/iris/v1/appStoreVersions/<version-id>/relationships/build",
  { data: { type: "builds", id: "<verified-build-id>" } }
);
```

## Categories and age rating

Discover current category ids and choose the primary and optional secondary categories from the app's actual purpose:

```js
await req("PATCH", "/iris/v1/appInfos/<app-info-id>", {
  data: {
    type: "appInfos",
    id: "<app-info-id>",
    relationships: {
      primaryCategory: {
        data: { type: "appCategories", id: "<primary-category-id>" }
      },
      primarySubcategoryOne: {
        data: <subcategory-resource-or-null>
      },
      primarySubcategoryTwo: {
        data: <subcategory-resource-or-null>
      }
    }
  }
});
```

For age rating:

1. Fetch the current `ageRatingDeclaration` resource and current schema.
2. Map every question to implemented content, remote content, user interaction, commerce, advertising, health, and parental-control facts.
3. Ask the user about only the facts that code and product documentation cannot establish.
4. Patch the complete declaration required by the current API.
5. Verify the calculated rating shown in App Store Connect.

Do not start from an all-clear declaration. A false negative can misrepresent the app.

## Privacy, content rights, and encryption

Build a complete data inventory before answering App Privacy:

- Data the app and bundled third-party SDKs collect.
- Whether each data type is linked to a person or used for tracking.
- Each collection purpose.
- Retention, account, and deletion behavior relevant to the public policy.

Map that inventory to the current App Store Connect privacy categories and purposes, then preview the product-page result before publishing. Apple's answers apply at the app level across supported platforms.

Patch content-rights and export-compliance resources only from verified facts:

```js
await req("PATCH", "/iris/v1/apps/<app-id>", {
  data: {
    type: "apps",
    id: "<app-id>",
    attributes: {
      contentRightsDeclaration: "<verified-content-rights-declaration>"
    }
  }
});

await req("PATCH", "/iris/v1/builds/<build-id>", {
  data: {
    type: "builds",
    id: "<build-id>",
    attributes: {
      usesNonExemptEncryption: <verified-boolean>
    }
  }
});
```

## Pricing and availability

Query current price points and choose the approved base territory and price point. Confirm availability and tax/business implications before creating a schedule:

```js
const points = await req(
  "GET",
  "/iris/v1/apps/<app-id>/appPricePoints?filter[territory]=<territory-id>&limit=1000&include=territory"
);

const selected = points.json.data.find(
  point => point.id === "<approved-price-point-id>"
);
if (!selected) throw new Error("Approved price point is unavailable");
```

Use the current API schema to create or update the price schedule. Re-query it and show the resulting customer price and base territory before moving on.

## App Review details

Use real contact details and app-specific review instructions:

```js
await req("POST", "/iris/v1/appStoreReviewDetails", {
  data: {
    type: "appStoreReviewDetails",
    attributes: {
      contactFirstName: "<real-first-name>",
      contactLastName: "<real-last-name>",
      contactEmail: "<real-email>",
      contactPhone: "<international-format-phone>",
      demoAccountRequired: <verified-boolean>,
      demoAccountName: "<review-account-name-or-empty>",
      demoAccountPassword: "<review-account-password-or-empty>",
      notes: "<approved-review-notes>"
    },
    relationships: {
      appStoreVersion: {
        data: { type: "appStoreVersions", id: "<version-id>" }
      }
    }
  }
});
```

Keep credentials out of repository files and logs. Store review-only credentials through the user's approved secret-handling path.

## Review submission

Immediately before this branch, re-confirm the explicit submission authorization and inspect existing review submissions. Create or reuse the appropriate container, add the version, then submit:

```js
const submission = await req("POST", "/iris/v1/reviewSubmissions", {
  data: {
    type: "reviewSubmissions",
    relationships: {
      app: { data: { type: "apps", id: "<app-id>" } }
    }
  }
});

const submissionId = submission.json.data.id;

await req("POST", "/iris/v1/reviewSubmissionItems", {
  data: {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: {
        data: { type: "reviewSubmissions", id: submissionId }
      },
      appStoreVersion: {
        data: { type: "appStoreVersions", id: "<version-id>" }
      }
    }
  }
});

await req("PATCH", `/iris/v1/reviewSubmissions/${submissionId}`, {
  data: {
    type: "reviewSubmissions",
    id: submissionId,
    attributes: { submitted: true }
  }
});
```

If the API reports an invalid entity state, read every associated validation error and resolve those exact resources. After submission, verify both the review-submission status and app-version status.

## Apple references

- [Submit an app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/)
- [Required, localizable, and editable properties](https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties/)
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [App and submission statuses](https://developer.apple.com/help/app-store-connect/reference/app-information/app-and-submission-statuses)
