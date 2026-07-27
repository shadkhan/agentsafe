# AgentSafe MVP Feature Audit

Date: 2026-07-27

## Executive Verdict

Verdict: NOT_READY

AgentSafe has a useful manual inspection MVP for ordinary page scanning and an experimental WebMCP metadata-review path, but it does not yet satisfy the repository's stated MVP acceptance criteria in `docs/USER_PERSONAS_AND_USE_CASES.md`.

The largest gaps are performance architecture, scan cancellation, partial-scan visibility, scoped exception behavior, and browser-runtime WebMCP verification. Automated tests and builds pass except install/audit checks, but the tested surface is narrower than the product claims.

## Persona Readiness

- Persona 1, Browser-Agent Developer: 62%
- Persona 2, WebMCP Website Developer: 68%
- Persona 3, AI Security and AppSec Engineer: 50%

## Agent Integration Level

Highest fully implemented level: LEVEL 1 - Exportable machine-readable report.

Evidence:

- Manual scan UI exists in `apps/extension/entrypoints/sidepanel/main.tsx:188`.
- Page and WebMCP reports can be exported/copied in `apps/extension/entrypoints/sidepanel/main.tsx:320-328` and `apps/extension/entrypoints/sidepanel/main.tsx:388-393`.
- No documented local API/SDK exists for live agent calls.
- No invocation authorization or tool-output scanning exists.

## Command Results

| Command | Exit | Result | Notes |
| --- | ---: | --- | --- |
| `pnpm install --frozen-lockfile` | 1 | FAILING | Lockfile stale for `packages/browser-scanner-adapter/package.json`; CI-style install fails. |
| `cargo fmt --all -- --check` | 0 | PASS | Rust formatting check passed. |
| `cargo clippy --workspace --all-targets -- -D warnings` | 0 | PASS | Rust clippy passed. |
| `cargo test --workspace` | 0 | PASS | 14 Rust tests passed. |
| `pnpm typecheck` | 0 | PASS | Package builds and extension typecheck passed. |
| `pnpm test` | 0 | PASS | 95 Vitest tests passed. |
| `pnpm e2e` | 0 | PASS | 3 Playwright smoke tests passed. |
| `pnpm --filter @agentsafe/extension build` | 0 | PASS | Production extension build passed. |
| `pnpm -r build` | 0 | PASS | Recursive package and extension build passed. |
| `pnpm audit --audit-level moderate` | 1 | FAILING | 24 vulnerabilities: 3 critical, 12 high, 8 moderate, 1 low. |
| Bundle size observation | 0 | PASS_WITH_WARNINGS | Built extension total 1.46 MB. WASM asset 1,165,780 bytes; sidepanel JS 277,408 bytes. No configured size budget. |

## Feature Completion Summary

- Verified: 54
- Untested or manual verification required: 24
- Partial: 30
- Missing: 29
- Blocked by browser support: 4
- Failing: 2

## Critical Blockers

1. CRITICAL: Large-content performance MVP is not implemented.
   Evidence: no Web Worker source exists beyond package description; scan runs in side panel via `scanDocument(parsed, settings)` at `apps/extension/entrypoints/sidepanel/main.tsx:100`. No cancellation/progress/worker timeout code found.

2. CRITICAL: Dependency security audit fails.
   Evidence: `pnpm audit --audit-level moderate` exit 1 with 3 critical and 12 high advisories, including `vitest`, `shell-quote`, and `tar` paths.

## High Blockers

1. HIGH: Frozen dependency install fails.
   Evidence: `pnpm install --frozen-lockfile` exit 1; `pnpm-lock.yaml` is stale for `packages/browser-scanner-adapter/package.json`.

2. HIGH: WebMCP browser-runtime discovery is not fully verified.
   Evidence: tests cover adapter logic and fixture presence, but no Chrome extension E2E loads the extension and scans the demo page.

3. HIGH: Worker architecture is claimed in personas but not implemented.
   Evidence: `docs/USER_PERSONAS_AND_USE_CASES.md:47` and `:844` require Rust/WASM in a Web Worker; production scan path is side-panel main thread.

4. HIGH: Partial scan UI is absent.
   Evidence: Rust/WASM returns completeness fields, but side panel WebMCP UI does not display partial/complete status prominently, and page scanner has no completeness model.

5. HIGH: Rule-specific exceptions are not implemented.
   Evidence: settings only expose `domainAllowlist` and `phraseAllowlist` in `packages/shared-types/src/index.ts:39-40`; no rule exception model exists.

## Section Audit

### A - Active Page Scanning

Status: PARTIALLY_IMPLEMENTED

Implemented evidence:

- A1: scan button calls `runScan("manual")`, `apps/extension/entrypoints/sidepanel/main.tsx:188`.
- A2: DOM scanner scans body elements, `packages/scanner/src/index.ts:10`.
- A3-A6: unit tests cover CSS hiding, Unicode, comments, metadata and base64, `packages/scanner/test/scanner.test.ts:28-107`.
- A7-A9: UI renders rule, severity, confidence, selector, evidence, explanation and action in `FindingCard`, `apps/extension/entrypoints/sidepanel/main.tsx:266-283`.
- A10: disclaimer says detection is advisory, `apps/extension/entrypoints/sidepanel/main.tsx:230`.

Gaps:

- Page scan does not include source ID or scan completeness in UI.
- Page scan uses TypeScript DOM scanner, not Rust/WASM, for ordinary webpage text.

### B - Visual Inspection

Status: IMPLEMENTED_NOT_TESTED

Evidence:

- Highlight, reveal, and clear functions exist at `apps/extension/entrypoints/sidepanel/main.tsx:702-718`.
- UI navigation exists at `apps/extension/entrypoints/sidepanel/main.tsx:235-243`.
- CSS hiding details are shown as JSON when available, `apps/extension/entrypoints/sidepanel/main.tsx:282`.

Gap:

- No automated extension runtime test verifies that highlight/reveal works in Chrome or that page content is restored.

### C - Allowlists and Configuration

Status: PARTIALLY_IMPLEMENTED

Evidence:

- Settings stored in `chrome.storage.local`, `apps/extension/entrypoints/sidepanel/main.tsx:47-55`.
- Domain and phrase allowlists exist in `packages/shared-types/src/index.ts:39-40`.
- Domain allowlist checks exact and subdomain matches in `packages/scanner/src/index.ts:304-313`.
- Phrase allowlist is tested, `packages/scanner/test/scanner.test.ts:112-124`.

Gaps:

- No rule-specific exceptions.
- No temporary session exceptions.
- Localhost/staging patterns are not separately modeled beyond generic domain matching.
- Domain allowlist disables all scan categories for that domain by design, but the UI text does not warn that unrelated checks are skipped.

### D - Rust Core

Status: IMPLEMENTED_AND_VERIFIED

Evidence:

- Platform-neutral crate exists at `crates/agentsafe-core`.
- README states no Chrome/DOM/React dependencies, `crates/agentsafe-core/README.md:5`.
- Text and structured scanning exports exist in `crates/agentsafe-core/src/lib.rs:7`.
- Limits and serializable findings exist in `crates/agentsafe-core/src/types.rs:69-185`.
- Deterministic risk scoring is tested in `crates/agentsafe-core/tests/core_tests.rs:176-183`.
- `cargo test --workspace` passed 14 Rust tests.
- Publishing gap: `wasm-pack` warns no `LICENSE` file despite MIT license metadata.

### E - WASM Package

Status: PARTIALLY_IMPLEMENTED

Evidence:

- WASM bridge exists in `crates/agentsafe-wasm/src/lib.rs`.
- npm wrapper exists in `packages/scanner-wasm/src/index.ts`.
- Extension production build includes local WASM asset `assets/agentsafe_wasm_bg-*.wasm`, size 1,165,780 bytes.
- `pnpm --filter @agentsafe/scanner-wasm build` passes during typecheck/build.

Gaps:

- No dedicated WASM integration test command runs the actual generated WASM in Node or browser.
- Initialized once per side-panel singleton, not per Worker because Worker is absent.

### F - Performance and Large Content

Status: NOT_IMPLEMENTED

Evidence:

- No Worker source files found for scanning.
- No cancellation, progress, chunking, overlap, deduplication, timeout or worker-restart code found.
- Page scan snapshots full document HTML via `snapshotPageForAgentSafe`, `apps/extension/entrypoints/sidepanel/main.tsx:601-617`.
- Rust limits exist, but ordinary page scan uses TS scanner and no completeness UI.

Release impact: CRITICAL.

### G - WebMCP Discovery

Status: PARTIALLY_IMPLEMENTED

Evidence:

- Experimental toggle exists at `apps/extension/entrypoints/sidepanel/main.tsx:419-420`.
- Feature flag defaults based on `navigator.modelContext`, `packages/shared-types/src/index.ts:118`.
- Active page collector uses `navigator.modelContext` feature detection and declarative forms, `apps/extension/entrypoints/sidepanel/main.tsx:619-697`.
- WebMCP empty state exists, `apps/extension/entrypoints/sidepanel/main.tsx:347-349`.
- Fixture exists at `fixtures/webmcp/demo.html`.
- E2E fixture presence test passes, `e2e/extension-smoke.spec.ts:21`.

Gaps:

- Discovery uses declarative form metadata and demo-global metadata. There is no proven browser API enumeration for already-registered imperative tools.
- No Chrome runtime test verifies actual extension discovery on a supported WebMCP page.

### H - WebMCP Definition Scanning

Status: IMPLEMENTED_AND_VERIFIED for adapter logic; MANUAL_VERIFICATION_REQUIRED for extension runtime.

Evidence:

- Adapter converts tool metadata to structured Rust scan value, `packages/webmcp-security/src/index.ts:299-314`.
- Human-readable fields are scanned or inspected by helper functions, `packages/webmcp-security/src/index.ts:418-436`.
- Credential, personal data, Unicode and mismatch heuristics exist, `packages/webmcp-security/src/index.ts:91-96` and `:318-327`.
- Tests cover suspicious description, hidden Unicode, credential schema, mismatch, hints and redaction, `packages/webmcp-security/test/webmcp-security.test.ts:126-246`.
- Rust core remains WebMCP-independent; no WebMCP terms appear in `crates/agentsafe-core/src`.

Gap:

- Contradictory `readOnlyHint` behavior is not detected as a finding.

### I - WebMCP Action Classification

Status: PARTIALLY_IMPLEMENTED

Evidence:

- Classifications implemented in `classifyWebMcpTool`, `packages/webmcp-security/src/index.ts:155-196`.
- Tests cover declared read-only, state-changing, unknown and readOnlyHint, `packages/webmcp-security/test/webmcp-security.test.ts:84-124` and `:201-216`.

Gaps:

- Sensitive state-changing classification is present but not directly tested.
- Contradictory readOnlyHint does not create a finding.

### J - WebMCP Decisions

Status: IMPLEMENTED_AND_VERIFIED for deterministic policy tests.

Evidence:

- Decision function exists, `packages/webmcp-security/src/index.ts:342-347`.
- Result includes risk, confidence, reasons, findings, origin and completeness, `packages/webmcp-security/src/index.ts:145-153`.
- Tests cover Allow, warning, Review, Require confirmation and Block cases.

Limitation:

- Presented as recommendations, not enforcement. This is correct for MVP boundaries.

### K - Reporting

Status: PARTIALLY_IMPLEMENTED

Evidence:

- Page export JSON/Markdown buttons exist, `apps/extension/entrypoints/sidepanel/main.tsx:320-328`.
- WebMCP JSON/Markdown export exists, `apps/extension/entrypoints/sidepanel/main.tsx:388-393`.
- WebMCP export redaction test passes, `packages/webmcp-security/test/webmcp-security.test.ts:233-246`.

Gaps:

- Page export redaction is not proven for raw credentials.
- Page export lacks scanner engine/rule-registry version and scan completeness.

### L - Privacy and Security

Status: PARTIALLY_IMPLEMENTED

Evidence:

- Manifest has no required host permissions and no external services, `apps/extension/.output/chrome-mv3/manifest.json`.
- Privacy doc says scanning is local and settings only are stored locally, `docs/privacy/PRIVACY.md:5`.
- WebMCP passive collector does not execute tools, `apps/extension/entrypoints/sidepanel/main.tsx:619-697`.

Gaps:

- `chrome.storage.session` caches findings/reports, `apps/extension/entrypoints/sidepanel/main.tsx:527-537`; this is not clearly documented in root `PRIVACY.md`.
- Dependency audit has critical/high vulnerabilities in dev/build chain.

### M - User Experience

Status: PARTIALLY_IMPLEMENTED

Evidence:

- Purpose and primary scan action are visible in side panel.
- Findings include explanations and recommended action.
- WebMCP unsupported message is actionable, `apps/extension/entrypoints/sidepanel/main.tsx:693-696`.

Gaps:

- Partial scan status is not generally visible.
- Evidence vs inference vs recommendation is clearer in WebMCP than page findings.

### N - Claims and Product Boundaries

Status: PARTIALLY_IMPLEMENTED

Evidence:

- Chrome Store text says WebMCP is experimental and passive.
- Personas correctly describe future SDK/enforcement as future.

Unsupported claims to remove or qualify:

- `docs/USER_PERSONAS_AND_USE_CASES.md` currently includes Worker, bounded chunking, scan progress, cancellation, partial scan reporting, and rule-specific exceptions as MVP criteria even though they are not implemented.
- Product statements should avoid implying Rust/WASM scanning for ordinary page content until page scanner is wired to Rust/WASM Worker.

## Rust Publishing Readiness

Status: PARTIALLY_IMPLEMENTED

Cargo package metadata exists, but release gap remains: no `LICENSE` file. `wasm-pack` repeatedly warns that `license = "MIT"` is set but no LICENSE files were found.

## WASM npm Publishing Readiness

Status: PARTIALLY_IMPLEMENTED

The package builds and the extension bundles the WASM locally. Prior evidence showed package files were corrected to include `pkg/agentsafe_wasm_bg.wasm`. Current audit did not rerun `pnpm --filter @agentsafe/scanner-wasm pack --dry-run`; should be rerun after lockfile is fixed.

## Minimum Verified Release Scope

Recommended minimum scope:

- Manual active-page scanning.
- Highlight/reveal as manual verified feature.
- Local settings with domain and phrase allowlists.
- Experimental WebMCP metadata review for declarative/demo-exposed metadata.
- Exportable reports with clear limitations.

Do not ship claims for:

- large-page no-freeze guarantees,
- Worker scanning,
- cancellation/progress,
- partial scan honesty for page scans,
- rule-specific exceptions,
- automatic agent enforcement,
- universal WebMCP discovery.
