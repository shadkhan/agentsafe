# AgentSafe Manual Test Plan

Date: 2026-07-27

Capture for every test:

- Chrome version
- Extension build hash or package version
- Page URL or fixture path
- Screenshot or exported report
- Pass/fail
- Notes

| ID | Scenario | Prerequisite | Exact steps | Expected result | Evidence to capture | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- |
| M01 | Ordinary safe article | Extension loaded from `apps/extension/.output/chrome-mv3` | Open `fixtures/benign/article.html`; click Scan | Low/no findings; advisory disclaimer visible | Side panel screenshot, JSON export | |
| M02 | Hidden `display:none` injection | File URL access enabled | Open `fixtures/malicious/hidden-instruction.html`; click Scan | Hidden instruction finding with selector and CSS evidence | Finding screenshot | |
| M03 | Opacity-zero injection | Create/open page with opacity 0 instruction | Click Scan | Hidden-css finding with opacity evidence | Screenshot | |
| M04 | Off-screen injection | Create/open page with absolute off-screen instruction | Click Scan | Hidden-css finding with position evidence | Screenshot | |
| M05 | Zero-width Unicode | Open `fixtures/malicious/unicode-and-encoded.html` | Click Scan | `zero-width-unicode` finding | Finding details | |
| M06 | Bidirectional Unicode | Open fixture with bidi control | Click Scan | `bidi-control` finding | Finding details | |
| M07 | Large Wikipedia-style article | Large local article, preferably >1 MB | Scan page | Current expected: may scan on side panel thread; record responsiveness | Video or notes | |
| M08 | Large preformatted log | Local large `<pre>` log | Scan page | Current expected: no progress/cancel; record delay/freezing | Timing notes | |
| M09 | Scan cancellation | N/A | Look for cancel control during scan | Expected current result: no cancel control | Screenshot | |
| M10 | Partial scan | Oversized/adversarial page | Scan page | Expected current result: no page partial-scan label | Screenshot/report | |
| M11 | Allowlisted localhost page | Run local server on localhost | Add localhost to Domain allowlist; scan | Findings skipped; verify UI communicates behavior | Settings and scan screenshots | |
| M12 | Rule-specific exception | N/A | Attempt to add exception for one rule only | Expected current result: not available | Settings screenshot | |
| M13 | Supported WebMCP demo | Chrome flag `chrome://flags/#enable-webmcp-testing` enabled | Open `fixtures/webmcp/demo.html`; click Scan; WebMCP tab | Tools listed; no tools executed | WebMCP tab screenshot | |
| M14 | No-tool WebMCP page | Any page without WebMCP tools | Click Scan; WebMCP tab | Empty state says normal page scan still applies | Screenshot | |
| M15 | Benign read-only tool | WebMCP demo | Inspect `searchCatalog` | Declared read-only; Allow | Tool detail screenshot | |
| M16 | State-changing tool | WebMCP demo | Inspect `submitSupportRequest` | State-changing; Require confirmation | Tool detail screenshot | |
| M17 | Suspicious tool description | WebMCP demo | Inspect `formatInvoice` | Prompt injection finding; Block | Tool detail screenshot | |
| M18 | Credential-requesting schema | WebMCP demo | Inspect `lookupOrder` | Credential finding; Block; redacted export | JSON export | |
| M19 | Missing annotations | Create tool without annotations | Scan and inspect | Unknown or inferred classification, not malicious solely for missing annotations | Tool detail | |
| M20 | Unsupported browser environment | Disable WebMCP flag or use unsupported Chrome | Click Scan; WebMCP tab | Actionable unsupported message, ordinary scan works | Screenshot | |
| M21 | JSON report export | Scan malicious and WebMCP fixture | Export JSON | JSON parses; contains findings | File and parse result | |
| M22 | Markdown report export | Scan WebMCP fixture | Export/copy Markdown | Markdown includes tools, decisions, findings | Markdown file | |
| M23 | Sensitive evidence redaction | Credential fixture | Export WebMCP JSON/Markdown | Credential values redacted | Exported report | |

## Manual Release Gate

Do not mark public MVP ready until M01-M06, M13-M18, M20-M23 pass. M07-M12 can pass only after Worker/cancellation/partial/exceptions are implemented or removed from MVP claims.
