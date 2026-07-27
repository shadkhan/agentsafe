# AgentSafe Release Blockers

Date: 2026-07-27

## Summary

- Critical blockers: 2
- High blockers: 5
- Medium blockers: 9
- Low blockers: 4

## Critical

### CRITICAL-1: Large-page performance architecture is not implemented

- Feature IDs: F1-F14
- Affected personas: P1, P3
- Problem: Persona spec requires Rust/WASM Web Worker scanning, bounded chunks, cancellation, progress and partial scan reporting. Current active-page scan snapshots full HTML and scans in the side panel.
- Evidence: `apps/extension/entrypoints/sidepanel/main.tsx:95-100`, `:601-617`; no Worker/cancel/progress code found by repository search.
- Recommended correction: move heavy text scanning to a dedicated Worker, process bounded chunks, add progress/cancel/timeout/completeness.
- Likely files: `apps/extension/entrypoints/sidepanel/main.tsx`, new worker package or `packages/browser-scanner-adapter`.
- Tests required: 1 MB, 5 MB, 20 MB, cancellation, chunk-boundary, many DOM nodes, worker failure.
- Blocks MVP release: yes, if the release uses the current persona MVP claims.

### CRITICAL-2: Dependency security audit fails

- Feature IDs: L/security audit
- Affected personas: all
- Problem: `pnpm audit --audit-level moderate` reports 24 vulnerabilities.
- Evidence: command exit 1; 3 critical, 12 high, 8 moderate, 1 low advisories.
- Recommended correction: update affected dev/build dependencies or document non-runtime scope with overrides after review.
- Likely files: `package.json`, `pnpm-lock.yaml`.
- Tests required: `pnpm audit --audit-level moderate`, build/test suite.
- Blocks MVP release: yes for public release readiness.

## High

### HIGH-1: Frozen install fails

- Feature IDs: release configuration
- Affected personas: all
- Problem: CI-style install cannot reproduce the workspace.
- Evidence: `pnpm install --frozen-lockfile` exit 1; lockfile stale for `packages/browser-scanner-adapter/package.json`.
- Recommended correction: refresh lockfile intentionally and rerun frozen install.
- Likely files: `pnpm-lock.yaml`.
- Tests required: `pnpm install --frozen-lockfile`.
- Blocks MVP release: yes.

### HIGH-2: WebMCP extension runtime discovery is not verified

- Feature IDs: G4-G5
- Affected personas: P1, P2, P3
- Problem: Unit tests validate adapter logic and fixture presence, but no automated Chrome extension test proves the side panel discovers and displays tools in runtime.
- Evidence: Playwright only checks fixture HTML, `e2e/extension-smoke.spec.ts:21`; no extension-loading E2E.
- Recommended correction: add Chromium extension E2E that loads AgentSafe, opens `fixtures/webmcp/demo.html`, clicks Scan, verifies WebMCP tab content.
- Likely files: `e2e/extension-smoke.spec.ts`, Playwright config.
- Tests required: extension runtime E2E with file URL access or local server.
- Blocks MVP release: yes for WebMCP claims beyond experimental manual verification.

### HIGH-3: Rule-specific exceptions missing

- Feature IDs: C6, persona acceptance criterion 6
- Affected personas: P3
- Problem: Only domain and phrase allowlists exist.
- Evidence: `packages/shared-types/src/index.ts:39-40`; no rule exception model found.
- Recommended correction: implement rule-scoped exceptions or remove MVP claim.
- Likely files: `packages/shared-types/src/index.ts`, `packages/scanner/src/index.ts`, settings UI, tests.
- Tests required: rule exception does not disable unrelated rules.
- Blocks MVP release: yes if persona spec remains unchanged.

### HIGH-4: Domain allowlist silently disables all checks

- Feature IDs: C9
- Affected personas: P1, P3
- Problem: If a domain is allowlisted, `scanDocument` returns no findings before category-specific scanning.
- Evidence: `packages/scanner/src/index.ts:14-20`.
- Recommended correction: make this explicit in UI/docs or redesign as scoped exceptions.
- Likely files: scanner and Settings UI.
- Tests required: allowlisted domain behavior and user-facing warning.
- Blocks MVP release: yes for security transparency.

### HIGH-5: Page reports lack completeness and scanner version metadata

- Feature IDs: K5, F10
- Affected personas: P3
- Problem: Page reports are useful but do not include scan completeness or Rust scanner engine/rule-registry versions.
- Evidence: page export uses `createSanitizedExport` and JSON stringify, `main.tsx:320-328`; WebMCP report has engine/completeness but page report does not.
- Recommended correction: add page scan completeness model and engine metadata, or document page scanner as TypeScript-only.
- Likely files: `packages/shared-types`, `packages/markdown-exporter`, side panel.
- Tests required: report schema test.
- Blocks MVP release: yes for AppSec persona claims.

## Medium

1. Sensitive state-changing WebMCP classification exists but lacks direct test.
2. Contradictory `readOnlyHint` does not generate a finding.
3. Page export redaction is not tested.
4. Localhost, 127.0.0.1 and staging allowlist behavior lack explicit tests.
5. Browser support is documented but WebMCP support depends on experimental Chrome flag.
6. Privacy docs understate `chrome.storage.session` scan-result caching.
7. No screenshot/manual evidence for visual highlight/reveal.
8. WASM package publish dry-run was not rerun during this audit.
9. No bundle-size budget exists.

## Low

1. No LICENSE file despite MIT metadata.
2. Chrome Store copy should stay careful about WebMCP limitations.
3. Existing untracked/deleted prompt files should be reconciled before release.
4. Docs need screenshots for manual demo.

## Claims To Remove Or Rewrite

- Rewrite any claim that ordinary page scanning runs in a Rust/WASM Web Worker.
- Rewrite MVP claims for scan progress, cancellation, bounded chunking and partial page-scan reporting until implemented.
- Rewrite rule-specific exception claims until implemented.
- Keep WebMCP claims explicitly experimental, passive and browser-support-dependent.

## Prioritized Remediation Backlog

| Priority | Feature ID | Problem | Recommended correction | Blocks MVP |
| --- | --- | --- | --- | --- |
| P0 | Release install | Frozen install fails | Update lockfile and rerun frozen install | Yes |
| P0 | Security audit | Critical/high advisories | Upgrade or override with review | Yes |
| P0 | F1-F14 | No Worker/cancel/progress/partial large scan | Implement Worker pipeline or remove MVP claim | Yes |
| P1 | G4-G5 | WebMCP runtime not verified | Add Chrome extension E2E | Yes for WebMCP |
| P1 | C6/C9 | Exceptions too broad/missing rule scope | Implement scoped exceptions | Yes if claimed |
| P1 | K5 | Missing page completeness/version report fields | Extend report schema | Yes for AppSec |
| P2 | I9 | Contradictory readOnlyHint not found | Add heuristic and tests | No, if documented |
| P2 | K7 | Page export redaction untested | Add redaction and tests | No, if risky content excluded |
| P2 | E7 | WASM runtime test absent | Add Node/browser WASM smoke test | No |
| P3 | Release docs | LICENSE missing | Add MIT LICENSE | No |
