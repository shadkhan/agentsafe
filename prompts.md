You are a senior Chrome Extension architect, browser-security engineer and
TypeScript developer.

Build an open-source Manifest V3 Chrome extension named:

AgentSafe — Prompt Injection Detector and Web Sanitizer

PRIMARY PURPOSE

Scan the current webpage for content that may manipulate AI agents, browser
assistants, web-to-LLM pipelines or users copying content into an LLM. Explain
the findings and allow the user to export a sanitized version of the page.

NON-NEGOTIABLE CONSTRAINTS

1. Entirely local execution.
2. No backend.
3. No authentication.
4. No telemetry or analytics.
5. No remote code.
6. No external AI API.
7. No eval or dynamically executed downloaded logic.
8. Minimal Chrome permissions.
9. Manifest V3 compliant.
10. Open-source and auditable.
11. Do not claim that detection is perfect.
12. Every finding must include evidence and an explanation.

TECHNOLOGY

- TypeScript
- WXT
- React for the side panel
- Vitest for unit tests
- Playwright for extension E2E tests
- chrome.storage.local for settings
- DOMPurify where appropriate
- Mozilla Readability for primary-content extraction
- Turndown or a carefully tested equivalent for Markdown conversion
- No dependency that sends network requests

CORE FEATURES

A. PAGE SCANNER

Detect:

- display: none
- visibility: hidden
- opacity near zero
- zero-width or zero-height elements containing text
- font-size zero or near zero
- text positioned far outside the viewport
- clipping used to hide text
- foreground/background colors with extremely low contrast
- zero-width Unicode characters
- bidirectional Unicode control characters
- suspicious HTML comments
- suspicious meta-tag content
- aria-hidden content containing instruction-like text
- base64-like encoded text where decoding produces readable instructions
- instruction override phrases
- role-manipulation phrases
- requests to ignore previous instructions
- requests to reveal system prompts
- suspicious delimiter blocks
- tool-use or data-exfiltration instructions

Do not classify a page as malicious based only on a phrase match.
Use multiple signals and confidence scoring.

B. RISK ENGINE

Create severity levels:

- Informational
- Low
- Medium
- High
- Critical

Each finding must contain:

- Rule ID
- Category
- Severity
- Confidence
- DOM selector
- Extracted evidence
- Why it matters
- Recommended action
- Whether the content was visible to the user
- Whether it would likely be included in extracted page text

Create a documented scoring algorithm with tests.

C. VISUAL INSPECTION

- Highlight suspicious elements on the page
- Provide next/previous finding navigation
- Temporarily reveal hidden text
- Show the CSS properties responsible for hiding it
- Allow highlights to be removed cleanly

D. SAFE CONTENT EXPORT

Provide:

- Extracted main content
- Sanitized main content
- Before-and-after diff
- Copy sanitized Markdown
- Download Markdown
- Download JSON report
- Source URL
- Page title
- Extraction timestamp
- Content hash
- List of removed or transformed findings

The sanitized version must remove or neutralize suspicious hidden content while
preserving legitimate visible content.

E. SIDE PANEL

Create these tabs:

1. Summary
2. Findings
3. Hidden Content
4. Sanitized Content
5. Export
6. Settings

The Summary tab should show:

- Overall risk score
- Findings by severity
- Hidden-text count
- Suspicious Unicode count
- Instruction-pattern count
- A clear disclaimer

F. SETTINGS

- Enable or disable individual rule categories
- Configure sensitivity
- Maintain local domain allowlist
- Maintain local phrase allowlist
- Choose whether aria-hidden content is included
- Reset all settings
- Export and import settings as JSON

G. PRIVACY AND SECURITY

- Scan only after explicit user action
- Prefer activeTab rather than broad host permissions
- Never store complete webpage content
- Store only user settings unless the user explicitly exports a report
- Sanitize all strings rendered in extension UI
- Add a threat model
- Add a privacy policy stating that no data leaves the browser
- Add a Chrome Web Store permission-justification document

PROJECT STRUCTURE

Create:

apps/extension/
packages/scanner/
packages/risk-engine/
packages/dom-sanitizer/
packages/markdown-exporter/
packages/shared-types/
fixtures/benign/
fixtures/malicious/
docs/architecture/
docs/threat-model/
docs/privacy/
docs/chrome-store/

TESTING

Include:

- At least 60 scanner unit tests
- Benign fixtures that must not trigger high-severity results
- Malicious and suspicious fixtures
- Unicode security tests
- CSS-hidden text tests
- Sanitization snapshot tests
- Risk-scoring tests
- Playwright tests for scanning, highlighting and exporting
- A false-positive regression suite

DOCUMENTATION

Generate:

- README.md
- ARCHITECTURE.md
- THREAT_MODEL.md
- SECURITY.md
- PRIVACY.md
- CONTRIBUTING.md
- CHROME_STORE_LISTING.md
- PERMISSION_JUSTIFICATION.md
- ROADMAP.md

CHROME STORE POSITIONING

Primary title:
AgentSafe — Prompt Injection Detector

Short description:
Detect hidden AI instructions and copy sanitized webpage content safely.

The listing must clearly state:

- Local-only scanning
- No external servers
- No data collection
- Open-source implementation
- Detection is advisory and not a guarantee of safety

Start by generating the architecture, permissions model, rule taxonomy, project
structure and implementation sequence. Then implement the MVP with tests.
