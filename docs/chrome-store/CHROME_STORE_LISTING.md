# Chrome Store Positioning

Primary title: AgentSafe - Prompt Injection Detector

Short description: Detect hidden AI instructions and copy sanitized webpage content safely.

Required statements:

- Local-only scanning.
- Rust/WASM scanning runs from packaged extension assets, not remote code.
- No external servers.
- No data collection.
- Open-source implementation.
- Detection is advisory and not a guarantee of safety.
- Large-page scans are bounded and may report partial status when configured limits are reached.
- Experimental WebMCP review is passive, browser-support-dependent, and does not execute, intercept, or block tools.
