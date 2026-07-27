# agentsafe-core

`agentsafe-core` is AgentSafe's platform-neutral scanner engine.

It does not depend on Chrome APIs, DOM APIs, React, extension messaging, browser storage, or Node-specific APIs. It scans text and JSON-compatible structured values using bounded resource limits and deterministic scoring.

## Public Surface

- `Scanner`
- `RuleDefinition`
- `RuleRegistry`
- `TextScanRequest`
- `StructuredScanRequest`
- `ScanLimits`
- `Finding`
- `ScanResult`
- `RiskAssessment`
- `ScanError`

The crate returns stable explanation/action keys instead of English UI copy.
