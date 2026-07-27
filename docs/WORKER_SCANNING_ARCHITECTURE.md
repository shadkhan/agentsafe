# Worker Scanning Architecture

AgentSafe scans page text in a dedicated module Worker so the side panel remains responsive during large scans.

Flow:

1. The side panel injects `collectTextSegmentsForAgentSafe` into the active tab.
2. The injected collector walks metadata, text nodes, and comments incrementally and returns bounded `ExtractedTextSegment` records with visibility metadata.
3. `runWorkerScan` in `@agentsafe/browser-scanner-adapter` chunks extracted text by scan mode.
4. The Worker initializes the Rust/WASM scanner, scans each chunk, maps Rust findings back to page selectors, and returns structured results.
5. The coordinator filters category settings and scoped exceptions, deduplicates overlap findings, records metrics, and returns a `ScanResult`.

Runtime artifacts expected in the extension build:

- `assets/scan-worker-*.js`
- `assets/agentsafe_wasm_bg-*.wasm`

The Worker protocol is versioned by `SCAN_PROTOCOL_VERSION` in `packages/browser-scanner-adapter/src/protocol.ts`.
