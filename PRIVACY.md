# Privacy

AgentSafe performs all scanning in the browser.

- No data leaves the browser.
- No account is required.
- No telemetry or analytics are collected.
- `chrome.storage.local` stores only user settings such as sensitivity, scan mode, enabled rule categories, allowlists, and scoped exceptions.
- `chrome.storage.session` caches the latest scan result per open tab, including findings and sanitized page content, so the side panel can redisplay it without rescanning. It is memory-backed and cleared when Chrome closes.
- Nothing is written to disk unless you export or download a report.

See `docs/privacy/PRIVACY.md` for the full policy.
