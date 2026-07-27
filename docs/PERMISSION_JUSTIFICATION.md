# Permission Justification

AgentSafe uses the narrowest permissions compatible with user-initiated page scanning.

- `activeTab`: inspect only the active page after the user requests a scan.
- `sidePanel`: display scan findings and WebMCP metadata review.
- `storage`: save local settings and cached scan state.
- `scripting`: inject read-only scan functions and highlighting helpers into the active page.
- `downloads`: save user-requested Markdown or JSON reports.
- `tabs`: read the active tab URL and title for optional per-site permission prompts.

AgentSafe does not request broad required host permissions.

Optional HTTP/HTTPS host access may be requested per site only after the user presses Scan and Chrome denies active-tab access. This supports existing page scanning and passive WebMCP metadata inspection for the current page.

The experimental WebMCP scanner adds no new required host permissions and does not execute WebMCP tools.
