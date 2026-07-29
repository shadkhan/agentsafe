# Changelog

All notable changes to AgentSafe are recorded here. Newest first.

## 0.9.0 - unreleased

Release-candidate version for the first Chrome Web Store submission. `0.1.0` read
as pre-alpha to anyone looking at the listing; `1.0.0` is held back until the
store review has actually passed.

### Fixed

- **Findings were scored using the wrong element's visibility.** The scan engine received one visibility label per chunk, but a chunk holds every segment of a page — usually the whole page at standard scan mode — so a single hidden element caused every finding on the page to be scored as hidden. Identical instruction text scored `low` when it was genuinely visible and `high` under the bug. Mapping and scoring moved to `packages/browser-scanner-adapter/src/finding-mapping.ts`, which resolves each match to the segment its offset lands in and scores from that segment. The engine is now called with a deliberately neutral context.
- **Hidden-CSS signals were counted more than once.** `display:none` mechanically produces a zero-sized box and an empty clip rect, and each was counted as separate evidence of intent, inflating severity on ordinary hidden markup.
- **The page risk score tracked finding count rather than severity.** Scores were a linear sum, so 40 informational matches (45) outranked three genuine high-severity findings (100, saturated). The worst finding now sets the floor and the remainder contributes at 0.25 weight capped at 30: the same inputs now score 12 and 50. Applied to both `packages/risk-engine/src/index.ts` and `crates/agentsafe-core/src/scoring.rs`.
- **Highlight, Reveal, and Clear silently did nothing on every real page.** `chrome.scripting.executeScript` serializes only the function it is handed, but these referenced module-scope helpers that do not exist in the page context, so injection threw and the rejection was swallowed by a floating promise. The injected functions are now self-contained, and page actions report failures to the user instead of failing silently. Caught by the new browser E2E.
- Removed three dead module-scope copies of the extraction helpers, superseded by the inlined versions inside the injected function.

### Removed

- **`packages/scanner` is deleted.** The pure-TypeScript `scanDocument` was not used by the extension — the live path is the Worker plus Rust/WASM — and it had drifted far enough to be actively misleading, carrying none of the rules added in this release. A reader comparing the two rule sets would have got a false picture of what the scanner detects. Its 71 tests exercised code no user ever ran; the two tests that depended on it, in `dom-sanitizer` and `markdown-exporter`, now build findings directly, which is what they were really testing. Suite count drops from 117 to 47 for that reason, not from lost coverage of shipping code.

### Changed

- **The store screenshot is now a photograph of the extension.** `pnpm capture:screenshot` runs the packaged build in Chromium, scans a page, and composites real side panel captures onto the 1280x800 canvas the store requires. The previous image was drawn by a PowerShell script and had already diverged from the shipping UI. It runs as a separate Playwright project so an ordinary `pnpm e2e` never rewrites a published asset.
- **The progress meter clears when a scan settles.** It previously stayed on screen frozen at whatever percentage the final chunk reported — "95%, scanning visible content" on a finished scan — which reads as a stuck scan. Found while reviewing the first real screenshot capture.
- **The `downloads` permission is gone.** Report exports save through an anchor element in the extension page, which an extension page can already do. The permission only added a line to the install prompt and a question at review. Exports now land in the browser's download location instead of opening a Save As dialog.
- **Manifest declares 16, 32, 48, and 128px icons** instead of 128 alone, so Chrome no longer downscales one bitmap for the toolbar and extensions page. All sizes are drawn from the same artwork in the asset script; the "AI" badge appears only at 128, where its lettering is legible.
- **`minimum_chrome_version` is now declared as 114**, the first version with the side panel API. Without it, older Chrome installs the extension and then fails at runtime.
- **Low-specificity rules no longer fire on ordinary prose.** `suspicious-comment-or-meta` matches a bare keyword list (`ai`, `agent`, `tool`, `llm`) and was applied to visible body text, so any page discussing AI flagged itself; it is now limited to metadata and comments, which is what it was written for. `tool-use` and `delimiter-block` on visible text now require corroboration — either the text is hidden, or another rule matched the same element. The benign `article.html` fixture used to trip `tool-use`; it no longer does.
- Privacy documentation now describes the `chrome.storage.session` per-tab scan cache. The previous text stated page content was never stored, but the cache holds the sanitized export, including extracted main content. It is memory-backed and cleared when Chrome closes. Corrected in `PRIVACY.md`, `docs/privacy/PRIVACY.md`, `README.md`, and `ARCHITECTURE.md`.
- Rule registry version is now `agentsafe-rules-2026-07-29`.
- Store submission doc now carries the concrete field values: the corrected data-use answer that matches the session cache, a note that the privacy policy URL must resolve for a signed-out visitor, and a reviewer answer for why `scripting` injects into all frames.

### Added

- **Unicode tag-block smuggling detection (U+E0000–U+E007F).** These characters render as nothing but mirror ASCII one-for-one, so a full instruction can be carried through apparently empty text. Detected by the new `tag-block-unicode` rule and stripped by the sanitizer.
- **"Ignore this rule on this site" on every finding card.** Writes a rule-scoped exception for the current host, applies it to the result already on screen, and persists it so later scans stay quiet. Editing the exceptions JSON by hand and rescanning was previously the only way to silence a false positive. Ignored rules are listed in Settings with a remove button, so the JSON editor is no longer the only way back out.
- **Repeated findings are grouped by rule.** The Findings tab shows a chip per rule with its occurrence count that jumps to the first match, and hidden-content lists group occurrences under a rule heading. Paging through forty cards to discover there were three distinct problems was the previous experience.
- **Exfiltration through URLs is now detected.** Two rules: `markdown-image-exfiltration` for markdown images pointed at an external URL whose query string is built to carry content — these load with no click, which is what makes them the usual leak route — and `url-parameter-exfiltration` for URLs carrying parameters named for the data an agent would hold. The second is corroboration-gated, since API documentation legitimately shows `?token=` examples.
- **Link and image URLs are now extracted.** URLs live in attributes, never in text nodes, so a data-carrying URL was previously invisible to every rule. Elements with a query-string URL are collected, capped per frame.
- **Tracking pixels are now treated as hidden.** The hidden-content heuristics looked for an element with no box around some text, which never matches a 1×1 image: it has a box, just a tiny one, and no text. URL-bearing elements smaller than 4×4 are now flagged.
- **Embedded frames are now scanned.** Extraction injects into every frame Chrome grants access to and the side panel merges the per-frame results. Findings carry the `frameUrl` they came from, and the summary reports how many of the detected frames were actually covered — Chrome withholds frames whose origin has not been granted, and previously that content was simply invisible with no indication.
- **Open shadow roots are now traversed.** Text inside web components was unreachable by a document-level `TreeWalker` but is still read by extraction tooling. Selectors inside a shadow root are recorded relative to their root and joined to the host with ` >>> `, since `querySelector` cannot cross the boundary. Highlight and Reveal follow those paths and inject their stylesheet into the shadow root, which does not inherit document styles. Closed roots remain unreachable by design.
- **Real-browser extension E2E** (`e2e/extension-scan.spec.ts`). Loads the packaged MV3 build in Chromium and drives actual scans over a real origin, covering what unit tests cannot: extension load, side panel boot, Worker startup, WASM initialization under the shipped CSP, findings, sanitized export, and page highlighting. Includes precision guards asserting the benign fixtures stay below triage severity.
- MIT `LICENSE` file, which the package metadata and store copy already claimed.

### Notes

- Rule registry version, engine coverage, and the risk formula all changed in this release. Findings and scores are not comparable with reports generated before it.
- The E2E loads a copy of the production build with `host_permissions` added. The shipped manifest deliberately has none and relies on `activeTab` plus `chrome.permissions.request`, both of which need a real user gesture that automation cannot produce. Every other artifact under test is the production build unchanged.
- CI now builds the extension before running E2E.

### Known issues

- The engine reports regex-match offsets against whitespace-normalized text but Unicode-match offsets against raw text, while segment offsets are raw. Drift is small because extraction pre-collapses whitespace, but a finding can be attributed to a neighbouring element.
- Corroboration for low-specificity rules is evaluated within a chunk. A match whose only supporting evidence sits in a different chunk is not corroborated.
- Closed shadow roots cannot be inspected, and cross-origin frames are only scanned when the user has granted that origin. The summary reports frame coverage so this is visible rather than silent.
