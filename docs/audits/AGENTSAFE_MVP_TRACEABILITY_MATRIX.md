# AgentSafe MVP Traceability Matrix

Date: 2026-07-27

Status vocabulary: IMPLEMENTED_AND_VERIFIED, IMPLEMENTED_NOT_TESTED, PARTIALLY_IMPLEMENTED, UI_ONLY, DOCUMENTED_ONLY, NOT_IMPLEMENTED, BLOCKED_BY_BROWSER_SUPPORT, MANUAL_VERIFICATION_REQUIRED, FAILING, NOT_APPLICABLE_TO_MVP.

| Feature ID | Persona | Use case | Requirement | Implementation status | Code evidence | Test evidence | Manual verification | Severity if missing | Release recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | P1/P3 | Active scan | User starts active page scan | IMPLEMENTED_AND_VERIFIED | `main.tsx:188`, `runScan` at `:90` | Typecheck/build pass | Chrome click smoke still needed | HIGH | Keep |
| A2 | P1/P3 | Detect injection | Scan page text | IMPLEMENTED_AND_VERIFIED | `packages/scanner/src/index.ts:10`, rules in `packages/scanner/src/rules.ts` | `scanner.test.ts` 71 tests | Fixture scan in browser | HIGH | Keep |
| A3 | P1/P3 | Hidden text | Detect hidden instruction-like content | IMPLEMENTED_AND_VERIFIED | `collectHidingCss`, `packages/scanner/src/index.ts` | CSS hiding tests in `scanner.test.ts` | Chrome reveal screenshot | HIGH | Keep |
| A4 | P1/P3 | Unicode | Detect zero-width | IMPLEMENTED_AND_VERIFIED | `ZERO_WIDTH_RE`, `packages/scanner/src/index.ts` | Unicode tests pass | None | MEDIUM | Keep |
| A5 | P1/P3 | Unicode | Detect bidi controls | IMPLEMENTED_AND_VERIFIED | `BIDI_RE`, `packages/scanner/src/index.ts` | Unicode tests pass | None | MEDIUM | Keep |
| A6 | P1/P3 | Metadata | Scan metadata/comments | IMPLEMENTED_AND_VERIFIED | `scanComments`, `scanMeta` | Tests at `scanner.test.ts:91-96` | None | MEDIUM | Keep |
| A7 | P3 | Evidence | Finding fields | PARTIALLY_IMPLEMENTED | `FindingCard`, `main.tsx:266-283` | Unit tests cover model partially | Inspect UI | HIGH | Add source/completeness |
| A8 | P3 | Hidden evidence | Visible/hidden distinction | IMPLEMENTED_AND_VERIFIED | `visibleToUser`, `likelyInExtractedText` | Scanner tests pass | None | HIGH | Keep |
| A9 | P1 | Summary | Overall risk | IMPLEMENTED_AND_VERIFIED | `Summary`, `main.tsx:216-231` | Risk tests pass | UI screenshot | MEDIUM | Keep |
| A10 | P1/P3 | Claims | Avoid safe claim | IMPLEMENTED_AND_VERIFIED | Disclaimer `main.tsx:230`, store docs | Manual review | Chrome Store copy review | HIGH | Keep |
| B1 | P1/P3 | Visual | Highlight finding | IMPLEMENTED_NOT_TESTED | `highlightAgentSafeFinding`, `main.tsx:702` | No runtime test | Required | HIGH | Add E2E |
| B2 | P1/P3 | Visual | Reveal hidden content | IMPLEMENTED_NOT_TESTED | `revealAgentSafeFinding`, `main.tsx:710` | No runtime test | Required | HIGH | Add E2E |
| B3 | P1/P3 | Visual | Remove highlights | IMPLEMENTED_NOT_TESTED | `clearAgentSafeHighlights`, `main.tsx:715` | No runtime test | Required | MEDIUM | Add E2E |
| B4 | P1/P3 | Visual | Navigate findings | IMPLEMENTED_NOT_TESTED | `next`, toolbar `main.tsx:235-243` | No UI runtime test | Required | MEDIUM | Add E2E |
| B5 | P3 | Hidden why | Show hiding info | IMPLEMENTED_AND_VERIFIED | `cssProperties` UI `main.tsx:282` | Scanner tests | Screenshot | MEDIUM | Keep |
| B6 | P3 | Non-destructive | Temporary highlighting | IMPLEMENTED_NOT_TESTED | CSS class add/remove only | No runtime test | Required | MEDIUM | Add E2E |
| C1 | P1/P3 | Allowlist | Exact-domain allowlist | IMPLEMENTED_NOT_TESTED | `isDomainAllowed`, `scanner/src/index.ts:304` | Not clearly tested for exact domain | Manual/browser | HIGH | Add tests |
| C2 | P1/P3 | Allowlist | Subdomain behavior | IMPLEMENTED_NOT_TESTED | `host.endsWith`, `scanner/src/index.ts:310` | No direct test found | Manual/browser | MEDIUM | Add tests/docs |
| C3 | P2/P3 | Allowlist | Localhost support | PARTIALLY_IMPLEMENTED | Generic URL hostname logic | No localhost test | Required | MEDIUM | Add tests |
| C4 | P2/P3 | Allowlist | 127.0.0.1 support | PARTIALLY_IMPLEMENTED | Generic URL hostname logic | No direct test | Required | MEDIUM | Add tests |
| C5 | P2 | Allowlist | Dev/staging URL patterns | PARTIALLY_IMPLEMENTED | Domain allowlist text UI | No pattern support beyond domain | Required | MEDIUM | Clarify scope |
| C6 | P3 | Exceptions | Rule-specific exceptions | NOT_IMPLEMENTED | No model in settings | No tests | N/A | HIGH | Implement or remove claim |
| C7 | P3 | Exceptions | Temporary session exceptions | NOT_IMPLEMENTED | No model found | No tests | N/A | MEDIUM | Remove if not MVP |
| C8 | P3 | Exceptions | Reversible exceptions | PARTIALLY_IMPLEMENTED | Settings UI editable/reset | No exception-specific tests | Required | MEDIUM | Add tests |
| C9 | P3 | Scope | Domain exception does not hide unrelated checks | FAILING | Domain allowlist returns empty scan `scanner/src/index.ts:14-20` | No warning test | Required | HIGH | Clarify or redesign |
| C10 | P1/P3 | Privacy | Local config storage | IMPLEMENTED_AND_VERIFIED | `chrome.storage.local`, `main.tsx:47-55` | Typecheck/build | Browser storage inspection | MEDIUM | Keep |
| D1-D12 | P1/P3 | Rust core | Platform-neutral scanner | IMPLEMENTED_AND_VERIFIED | `crates/agentsafe-core` | `cargo test` 14 pass; clippy pass | None | HIGH | Keep |
| D13 | Release | Rust publish | Metadata/license | PARTIALLY_IMPLEMENTED | Cargo metadata | wasm-pack LICENSE warning | N/A | MEDIUM | Add LICENSE |
| E1-E4 | P1/P2/P3 | WASM | Local Rust/WASM bridge | IMPLEMENTED_AND_VERIFIED | `crates/agentsafe-wasm`, `packages/scanner-wasm`, output `.wasm` | Build pass | Browser init smoke | HIGH | Keep |
| E5 | P1/P3 | WASM init | Once per Worker | NOT_IMPLEMENTED | No Worker exists | No test | N/A | HIGH | Implement Worker |
| E6 | P2 | API | Typed JS/WASM API | IMPLEMENTED_AND_VERIFIED | `packages/scanner-wasm/src/index.ts` | Build pass | Node smoke useful | MEDIUM | Keep |
| E7 | P3 | Tests | WASM integration tests | PARTIALLY_IMPLEMENTED | Unit package compile only | No actual WASM runtime test in suite | Required | MEDIUM | Add smoke test |
| E8 | Release | npm build | Package builds | IMPLEMENTED_AND_VERIFIED | package scripts | `pnpm -r build` pass | N/A | MEDIUM | Keep |
| E9 | Release | publish metadata | npm/crate readiness | PARTIALLY_IMPLEMENTED | package metadata | lockfile fail | N/A | MEDIUM | Fix lock/LICENSE |
| E10 | Release | size | Package size measured | IMPLEMENTED_NOT_TESTED | output sizes recorded | No budget | N/A | LOW | Add budget |
| F1-F14 | P1/P3 | Performance | Worker/chunk/progress/cancel/large tests | NOT_IMPLEMENTED | No Worker/chunk/cancel code found | No relevant tests | Required | CRITICAL | Block public MVP claims |
| G1 | P2 | WebMCP | Experimental label | IMPLEMENTED_AND_VERIFIED | Settings label `main.tsx:419` | Typecheck/build | UI screenshot | MEDIUM | Keep |
| G2-G3 | P2 | WebMCP | Support detection/fail gracefully | IMPLEMENTED_AND_VERIFIED | `detectWebMcpSupport`; collector message | WebMCP tests pass | Browser unsupported check | HIGH | Keep |
| G4-G5 | P2 | WebMCP | Active page discovery | PARTIALLY_IMPLEMENTED | `collectWebMcpForAgentSafe`, `main.tsx:619` | Fixture only | Supported Chrome manual | HIGH | Manual verify |
| G6 | P2/P3 | WebMCP | No tool execution | IMPLEMENTED_AND_VERIFIED | Collector reads metadata only | Code review | Manual DevTools check | CRITICAL | Keep |
| G7-G8 | P2 | WebMCP | No tools empty state | IMPLEMENTED_AND_VERIFIED | `main.tsx:347-349` | WebMCP no-tool unit | UI screenshot | MEDIUM | Keep |
| G9-G10 | P2/P3 | WebMCP | Origin/frame origin | PARTIALLY_IMPLEMENTED | `location.origin` captured | No iframe tests | Required | MEDIUM | Add iframe test |
| G11-G12 | P2 | WebMCP | Browser/perms docs | IMPLEMENTED_AND_VERIFIED | `docs/WEBMCP_BROWSER_SUPPORT.md`, permission docs | Manual doc review | N/A | MEDIUM | Keep |
| H1-H11 | P2/P3 | WebMCP scan | Scan/inspect metadata fields | IMPLEMENTED_AND_VERIFIED | `toStructuredScanValue`, `searchableText` | WebMCP tests pass | Browser runtime | HIGH | Keep |
| H12-H18 | P2/P3 | WebMCP risks | Unicode/injection/credentials/mismatch | IMPLEMENTED_AND_VERIFIED | heuristics `webmcp-security/src/index.ts:318-327` | Tests pass | Manual fixture | HIGH | Keep |
| H19-H20 | Architecture | WebMCP adapter | Rust independent; TS adapter | IMPLEMENTED_AND_VERIFIED | no WebMCP in Rust core; adapter package | Rust/WebMCP tests | N/A | HIGH | Keep |
| I1-I8 | P2/P3 | Classification | All classifications and deterministic reasoning | PARTIALLY_IMPLEMENTED | `classifyWebMcpTool` | Many tests pass | Sensitive state-changing test missing | MEDIUM | Add tests |
| I9 | P2/P3 | Classification | Contradictory readOnlyHint finding | NOT_IMPLEMENTED | no rule found | no test | Required | HIGH | Implement |
| I10 | P2 | Classification | Missing annotations benign | IMPLEMENTED_AND_VERIFIED | Unknown classification | Test `missing annotations` | N/A | MEDIUM | Keep |
| J1-J11 | P2/P3 | Decisions | Recommendation decisions | IMPLEMENTED_AND_VERIFIED | `decideTool` | Tests pass | UI screenshot | HIGH | Keep as recommendation |
| K1-K4 | P1/P2/P3 | Export | JSON/Markdown reports | IMPLEMENTED_AND_VERIFIED | export buttons/functions | Export tests partially | Manual downloads | HIGH | Keep |
| K5 | P3 | Report metadata | Page report completeness/version | PARTIALLY_IMPLEMENTED | Page report fields exist | no completeness/version test | Required | HIGH | Add metadata |
| K6 | P2/P3 | WebMCP report fields | Tools/classifications/support | IMPLEMENTED_AND_VERIFIED | report interface/export | WebMCP tests | Manual parse | HIGH | Keep |
| K7-K10 | P3 | Redaction/parse | Redacted valid exports | PARTIALLY_IMPLEMENTED | WebMCP redaction | WebMCP export test only | Page export required | HIGH | Add page redaction |
| L1-L4 | P1/P3 | Local-only | No backend/remote WASM | IMPLEMENTED_AND_VERIFIED | manifest, local wasm asset | build/audit inspection | Network manual | CRITICAL | Keep |
| L5 | Release | Permissions | Minimal permissions | IMPLEMENTED_AND_VERIFIED | manifest output | build output | Chrome permission review | HIGH | Keep |
| L6-L8 | Privacy | Storage docs | Privacy matches behavior | PARTIALLY_IMPLEMENTED | docs/privacy says settings only | session cache exists | Review docs | MEDIUM | Update privacy |
| L9 | Privacy | Log redaction | Secret logs | PARTIALLY_IMPLEMENTED | export redaction only | no log tests | Required | MEDIUM | Add tests |
| L10 | Privacy | Messaging API | No unrestricted external API | IMPLEMENTED_NOT_TESTED | no external messaging found | no test | Manual review | HIGH | Keep |
| L11-L12 | Boundaries | No universal claims/no tool exec | IMPLEMENTED_AND_VERIFIED | docs/store + code | code review | N/A | CRITICAL | Keep |
| M1-M10 | UX | Understandable UI | PARTIALLY_IMPLEMENTED | side panel sections | no screenshots | Manual UX plan | MEDIUM | Manual verify |
| N | Claims | Product boundaries | PARTIALLY_IMPLEMENTED | store text ok; personas overclaim MVP | no tests | doc review | HIGH | Rewrite personas or implement gaps |
