# Chrome Web Store Publishing Form Details

This file contains the copy, assets, and upload instructions for publishing AgentSafe in the Chrome Web Store Developer Dashboard.

Official references checked:

- Chrome upload package guidance: https://developer.chrome.com/docs/webstore/prepare
- Chrome first-time publishing flow: https://developer.chrome.com/docs/webstore/publish
- Chrome listing fields and graphic assets: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Chrome image requirements: https://developer.chrome.com/docs/webstore/images
- Chrome privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome distribution settings: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution

## Prepared Files

| Purpose | File |
| --- | --- |
| Packaged icons | `apps/extension/public/icon/16.png`, `32.png`, `48.png`, `128.png` |
| Upload package ZIP | `apps/extension/.output/agentsafeextension-0.9.0-chrome.zip` |
| Built extension folder | `apps/extension/.output/chrome-mv3` |
| Packaged extension icon | `apps/extension/public/icon/128.png` |
| Store icon copy | `docs/chrome-store/assets/agentsafe-icon-128.png` |
| Store screenshot (captured from the running panel) | `docs/chrome-store/assets/agentsafe-store-screenshot-1280x800.png` |
| Screenshot capture spec | `e2e/store-screenshot.spec.ts` |
| Small promo tile | `docs/chrome-store/assets/agentsafe-small-promo-440x280.png` |
| Asset generator | `scripts/prepare-chrome-store-assets.ps1` |

## What To Upload As ZIP

Upload this ZIP in the Chrome Developer Dashboard:

```text
apps/extension/.output/agentsafeextension-0.9.0-chrome.zip
```

Do not upload the source repository. Do not ZIP the parent folder in a way that places `chrome-mv3/manifest.json` inside the archive. Chrome requires `manifest.json` at the ZIP root.

If you ever need to create a ZIP manually, compress the contents of this folder:

```text
apps/extension/.output/chrome-mv3
```

The ZIP root must look like this:

```text
manifest.json
sidepanel.html
background.js
icon/128.png
assets/...
chunks/...
```

Recommended command:

```bash
pnpm --filter @agentsafe/extension zip
```

## Store Listing Form

| Field | Recommended Value |
| --- | --- |
| Name | AgentSafe - Prompt Injection Detector |
| Short name | AgentSafe |
| Summary / short description | Detect hidden AI instructions and copy sanitized webpage content safely. |
| Category | Productivity |
| Language | English |
| Mature content | No |
| Website / homepage URL | `https://github.com/shadkhan/agentsafe` |
| Support URL | `https://github.com/shadkhan/agentsafe/issues` |
| Privacy policy URL | `https://github.com/shadkhan/agentsafe/blob/main/PRIVACY.md` |

The privacy policy URL must resolve for a signed-out visitor. Chrome rejects a listing whose policy link 404s, which is what happens if the repository is still private. Confirm the repository is public before submitting, or host the policy elsewhere and use that URL instead.

Category note: use `Productivity` for a user-facing browser safety tool. If you want to position it mainly for engineers and security reviewers, `Developer Tools` is also reasonable.

## Detailed Description

Paste this into the detailed description field:

```text
AgentSafe scans the current webpage for content that may manipulate AI agents, browser assistants, web-to-LLM pipelines, or people copying page content into an LLM.

It highlights suspicious hidden text, Unicode controls, instruction-like phrases, suspicious metadata, HTML comments, delimiter blocks, and encoded instructions.

AgentSafe is local-only. It uses no external servers, collects no data, has no telemetry, and does not call remote AI APIs. Scanning, scoring, sanitizing, and report export happen inside the browser extension.

Key features:
- User-triggered page scanning
- Quick, standard, and deep scan modes
- Hidden text and metadata detection
- Unicode and encoded-content checks
- Confidence, severity, evidence, and selector details
- Finding explanations with possible impact and recommended action
- Highlight and reveal tools for page review
- Sanitized Markdown and JSON report export
- Local settings and scoped exceptions

AgentSafe also includes an experimental WebMCP Security Scanner for supported Chrome testing environments. It passively reviews WebMCP tool metadata exposed by the active page and does not execute, intercept, or block WebMCP tools.

Detection is advisory, not a guarantee of safety. AgentSafe can miss attacks and can flag benign content, so users should review the evidence before relying on any result.
```

## Graphic Assets

| Chrome Field | File | Dimensions |
| --- | --- | --- |
| Store icon | `docs/chrome-store/assets/agentsafe-icon-128.png` | 128x128 PNG |
| Screenshots | `docs/chrome-store/assets/agentsafe-store-screenshot-1280x800.png` | 1280x800 PNG |
| Small promo tile | `docs/chrome-store/assets/agentsafe-small-promo-440x280.png` | 440x280 PNG |

Chrome requires the extension icon to also be inside the uploaded ZIP. This repo packages it at:

```text
icon/128.png
```

inside:

```text
apps/extension/.output/agentsafeextension-0.9.0-chrome.zip
```

## Privacy Practices Tab

### Single Purpose

```text
AgentSafe helps users inspect the active webpage for hidden, encoded, obfuscated, metadata-based, or instruction-like content that may affect AI agents and web-to-LLM workflows, then lets them review findings and export sanitized content locally.
```

### Remote Code

Select:

```text
No, I am not using remote code.
```

Explanation if a text box appears:

```text
AgentSafe does not load or execute remote code. The scan worker and Rust/WASM scanner are bundled with the extension package.
```

### Data Use

Recommended answer:

```text
No user data is collected, sold, transferred, or used for unrelated purposes.
```

Reviewer-facing clarification:

```text
AgentSafe reads the active page only after the user requests a scan. Page content is processed locally in the browser extension and is not sent to the developer, third parties, analytics services, telemetry systems, or external AI APIs. Nothing is written to disk unless the user exports a report. Settings are stored in chrome.storage.local, and the most recent scan result for each open tab is cached in chrome.storage.session, which is memory-backed and cleared when Chrome closes.
```

If the dashboard asks about data categories, select no collected data only if the form defines collection as transmitting or storing user data outside the user's device. If the form treats local processing as a disclosure category, disclose webpage content / website content and explain that it is processed locally only.

Do not describe the extension as storing no page content. The per-tab `chrome.storage.session` cache holds the sanitized export for the current browsing session, and the answer above is worded to match that.

## Permission Justifications

| Permission | Justification |
| --- | --- |
| `activeTab` | Allows AgentSafe to inspect the active page only after the user requests a scan or page action. |
| `sidePanel` | Displays scan status, findings, explanations, settings, and export actions in Chrome's side panel. |
| `storage` | Stores local user settings such as scan mode, sensitivity, enabled categories, allowlists, and scoped exceptions. |
| `scripting` | Runs user-triggered page extraction, highlight, reveal, and cleanup scripts on the active tab and its frames. |
| `tabs` | Reads active-tab URL/title for scan context, cached per-tab results, badge updates, and optional per-site permission prompts. |
| Optional `http://*/*`, `https://*/*` host access | Requested per site only when needed for user-triggered scanning. AgentSafe does not use broad static host permissions. |

AgentSafe does not request `downloads`. Reports are saved through an anchor element in the extension page.

If a reviewer asks why `scripting` injects into all frames: prompt-injection content is routinely placed in an embedded frame precisely because a top-frame-only scanner will not see it. Chrome still withholds frames whose origin the user has not granted, and the extension reports how many frames it actually covered.

## Distribution Tab

| Field | Recommended Value |
| --- | --- |
| Visibility | Public for launch, Unlisted for a quiet soft launch, Private for tester-only validation |
| Regions | All regions unless you have a specific regional reason to limit availability |
| Pricing | Free |
| In-app purchases | No |

Chrome notes that all visibility modes still go through review, so use Private only for tester access, not to bypass policy review.

## Pre-Submission Checklist

| Check | Status |
| --- | --- |
| `manifest.json` at ZIP root | Verified |
| `icon/16.png`, `32.png`, `48.png`, `128.png` inside ZIP | Verified |
| Store icon generated | Verified |
| Screenshot generated | Verified |
| Small promo tile generated | Verified |
| Production ZIP generated | Regenerate after the version bump |
| `pnpm verify:clean` passing | Verified |
| Browser E2E passing against the packaged build | Verified |
| Privacy policy URL resolves when signed out | Verify after making the repository public |
| CI passing on GitHub | Verify after pushing |
| Screenshot reflects the current side panel | Captured from the running extension by `pnpm capture:screenshot`; recapture after UI changes |

## Regenerate Assets

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/prepare-chrome-store-assets.ps1
pnpm --filter @agentsafe/extension build
pnpm capture:screenshot
pnpm --filter @agentsafe/extension zip
```

The icons and the promo tile are drawn by the PowerShell script. The 1280x800
screenshot is not: `pnpm capture:screenshot` runs the extension in Chromium,
scans a page, and photographs the real side panel. Recapture it whenever the
panel UI changes, and note that it requires a current build.

Then upload the regenerated ZIP from:

```text
apps/extension/.output/agentsafeextension-0.9.0-chrome.zip
```
