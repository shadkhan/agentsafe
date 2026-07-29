# Privacy Policy

AgentSafe does not collect, transmit, sell, or share user data.

All scanning happens locally in the browser, including the Rust/WASM scanner and scan Worker. AgentSafe has no backend, no accounts, no telemetry, and makes no network requests of its own.

## What AgentSafe Stores

| Storage | Contents | Lifetime |
| --- | --- | --- |
| `chrome.storage.local` | Settings only: sensitivity, scan mode, enabled rule categories, domain and phrase allowlists, scoped exceptions, auto-scan and badge preferences | Until you change or reset them |
| `chrome.storage.session` | The most recent scan result for each open tab: findings with their evidence excerpts, and the sanitized page content used by the Sanitized and Export tabs | Held in memory and cleared when Chrome closes |

The `chrome.storage.session` cache is what lets you reopen the side panel on a tab and see the previous result without rescanning. It is memory-backed, is never written to disk by the extension, is not accessible to webpages, and is discarded when the browser closes. It does contain content derived from the page you scanned, including the extracted main content and sanitized Markdown.

Nothing is persisted to disk unless you explicitly export or download a report.

## What AgentSafe Sends

Nothing. There are no external servers, analytics endpoints, AI APIs, or remote code. The scanner and its WASM binary are packaged inside the extension.
