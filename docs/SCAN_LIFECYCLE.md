# Scan Lifecycle

1. User presses Scan or auto-scan starts after a configured delay.
2. The side panel saves local settings.
3. Domain allowlist is checked before page access.
4. Page text segments are collected with scan-mode limits.
5. Segments are queued as bounded chunks.
6. The scan Worker initializes the Rust/WASM scanner.
7. Chunks are scanned with per-mode timeouts.
8. Findings are filtered, deduplicated, summarized, and cached in `chrome.storage.session`.
9. Sanitized Markdown and JSON exports are generated locally.

Cancellation can happen during extraction or Worker scanning. Cancelled scans report `cancelled`; findings found before cancellation remain advisory and valid.
