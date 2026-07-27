# Worker Release Hardening Gap Analysis

Date: 2026-07-27

## Current Architecture

- Package manager: pnpm workspace, `pnpm-workspace.yaml`.
- Extension bundler: WXT/Vite, `apps/extension/wxt.config.ts`.
- Background/service worker: `apps/extension/entrypoints/background.ts`, side-panel opener only.
- Side panel: `apps/extension/entrypoints/sidepanel/main.tsx`.
- Existing scan invocation: `runScan` injects `snapshotPageForAgentSafe`, parses full HTML in the side panel, then calls `scanDocument(parsed, settings)`.
- Current page-text extraction: full-document snapshot and full DOMParser parse.
- Rust core: `crates/agentsafe-core`.
- WASM bridge/package: `crates/agentsafe-wasm`, `packages/scanner-wasm`.
- Worker-related package: `packages/browser-scanner-adapter`, but before this hardening pass it contained only package/tsconfig scaffolding.
- Cancellation/progress: no production cancellation; status string only.
- Allowlist/exceptions: `domainAllowlist` and `phraseAllowlist` only; no scoped rule exceptions.
- Test setup: Vitest for packages, Playwright smoke tests, Cargo tests.
- Lockfiles: `pnpm-lock.yaml` and `Cargo.lock`.

## Remaining Audit Blockers Mapped To Code

| Blocker | Current evidence | Required correction |
| --- | --- | --- |
| Worker scanning absent | `main.tsx` calls `scanDocument` in side panel | Add dedicated Worker, scan chunks with Rust/WASM, connect to Scan button |
| Full-page synchronous extraction | `snapshotPageForAgentSafe` clones full document | Replace scan path with incremental segment extraction |
| Cancellation absent | No cancel UI/state | Add scan coordinator state and hard Worker termination |
| Progress absent | `status` string only | Add real phase/chunk progress model |
| Partial status absent | Page `ScanResult` has no scan metadata | Add scan metadata/completeness to result and UI |
| Worker watchdog absent | No Worker lifecycle code | Add init/chunk timeout, restart limit, partial reason |
| Scoped exceptions absent | `domainAllowlist`, `phraseAllowlist` only | Add typed scoped exceptions and deterministic matcher |
| Frozen install fails | lockfile stale | Refresh lockfile after dependency graph changes |
| Clean build verification absent | no script | Add reproducible verification script and package script |

## Implementation Plan

1. Add shared scan metadata, scan mode and scoped exception types.
2. Implement `@agentsafe/browser-scanner-adapter`:
   - typed protocol
   - chunking
   - deduplication
   - exception matching
   - worker coordinator
   - WASM worker
3. Wire side-panel production scan flow to the adapter.
4. Add cancellation/progress/status UI.
5. Add tests for chunking, deduplication, exception matching and reducer/progress behavior.
6. Update reproducible install metadata and scripts.
7. Update documentation and validation audit.
