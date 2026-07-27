# Chrome Web Store Permission Justification

AgentSafe uses:

- `activeTab` to inspect only the active page after the user requests a scan.
- `sidePanel` to display scan findings.
- `storage` to save local settings.
- `scripting` for active-tab inspection and highlighting.
- `downloads` for user-requested report downloads.
- `tabs` to read active-tab URL/title for per-site optional permission prompts when needed.

No host permissions are requested. No data is sent to external services.

Optional HTTP/HTTPS host access may be requested per site only after the user presses Scan and Chrome denies active-tab access. This is used to inspect the current page, not for background scanning.

The experimental WebMCP Security Scanner uses the same active-page access path to passively inspect tool metadata exposed by the page. It adds no new required host permissions and never executes WebMCP tools.
