You are a senior Chrome Extension, WebMCP and agent-security engineer.

Work inside the existing AgentSafe repository after the Rust/WASM scanner has been integrated successfully.

OBJECTIVE

Add a minimal, passive and experimental WebMCP Security Scanner to AgentSafe for the first public release.

The feature must inspect WebMCP tool definitions exposed by the active webpage without executing those tools.

Do not implement:

- automatic tool execution
- tool-output interception
- agent intent alignment
- a local MCP server
- automatic blocking of another browser agent
- cloud services
- LLM-based classification

FEATURE FLAG

Add:

experimentalWebMcpSecurity

Default it to enabled only when browser support is detected, while clearly labeling the feature as Experimental.

When WebMCP is unsupported, fail gracefully and explain how local developers can enable the required Chrome testing support.

DISCOVERY

From the active page’s content-script context, discover WebMCP tools using only browser-supported APIs.

For each tool collect, where exposed:

- name
- title
- description
- origin
- frame origin
- declarative or imperative type
- input schema
- output schema
- parameter names
- parameter descriptions
- enum values
- examples
- annotations
- readOnlyHint
- untrustedContentHint

Do not invent unavailable metadata.

HOST PERMISSIONS

Review the extension’s current host permissions.

Use the narrowest permissions compatible with the existing AgentSafe page-scanning purpose.

Document every permission change in:

docs/PERMISSION_JUSTIFICATION.md

SECURITY SCANNING

Create a TypeScript WebMCP adapter that converts WebMCP definitions into generic structured scan requests for the existing Rust/WASM scanner.

The Rust core must remain WebMCP-independent.

Scan human-readable strings in:

- tool name
- title
- description
- parameter descriptions
- enum values
- examples
- input-schema descriptions
- output-schema descriptions
- annotations

Detect:

- prompt override instructions
- role manipulation
- requests to reveal system prompts
- credential requests
- cookie or session-token requests
- unrelated personal-data requests
- data-exfiltration instructions
- suspicious cross-origin instructions
- hidden Unicode
- bidirectional Unicode controls
- encoded suspicious instructions
- misleading differences between tool name, description and schema

ACTION CLASSIFICATION

Classify each tool as:

- Declared read-only
- Likely read-only
- State-changing
- Sensitive state-changing
- Unknown

Use:

- readOnlyHint
- tool name
- description
- input schema
- action verbs
- sensitive fields

Make it clear when classification is inferred rather than explicitly declared.

DECISIONS

Return one of:

- Allow
- Allow with untrusted-content warning
- Review
- Require confirmation
- Block

Suggested deterministic policy:

- benign declared read-only tool: Allow
- tool with untrustedContentHint: Allow with untrusted-content warning
- unknown state-changing tool: Require confirmation
- tool requesting unrelated credentials: Block
- strong prompt injection in description: Block
- ambiguous tool-description/schema mismatch: Review

Every decision must include:

- risk score
- confidence
- reasons
- findings
- origin
- scan completeness

USER INTERFACE

Add a WebMCP Security section or tab.

Display:

- browser-support status
- number of discovered tools
- page origin
- each tool’s name
- tool type
- action classification
- risk level
- recommended decision
- annotations
- findings count

Tool details must show:

- full description
- formatted schemas
- suspicious evidence
- rule IDs
- explanation
- recommended user action

EMPTY STATE

When no tools are present, display:

“No WebMCP tools are registered on this page. AgentSafe still scanned the webpage for ordinary hidden and indirect prompt-injection risks.”

Do not present the feature as broken.

REPORTING

Allow the user to copy or export a WebMCP security report as JSON or Markdown.

The report should include:

- page URL
- page origin
- scan timestamp
- browser-support status
- AgentSafe version
- scanner-engine version
- tool definitions
- classifications
- decisions
- findings
- scan completeness

Redact detected credentials or sensitive evidence.

DEMO FIXTURES

Create a local demo page containing:

- one benign read-only WebMCP tool
- one benign state-changing tool
- one suspicious tool description
- one tool requesting unnecessary credentials
- one tool with hidden Unicode
- one tool with untrustedContentHint

Use the demo page for manual testing and automated E2E tests.

TESTING

Add tests for:

- unsupported browser
- no registered tools
- benign read-only tool
- benign state-changing tool
- missing annotations
- suspicious description
- hidden Unicode
- credential-requesting schema
- description/schema mismatch
- untrustedContentHint
- readOnlyHint
- malformed schema
- export redaction
- deterministic risk decisions
- production extension build

DOCUMENTATION

Create:

- docs/WEBMCP_SECURITY_OVERVIEW.md
- docs/WEBMCP_BROWSER_SUPPORT.md
- docs/WEBMCP_THREAT_MODEL.md
- docs/WEBMCP_RULES.md
- docs/WEBMCP_REPORT_FORMAT.md
- docs/WEBMCP_DEMO.md

DEFINITION OF DONE

The work is complete when:

1. AgentSafe can list WebMCP tools on supported pages.
2. It scans tool definitions without executing tools.
3. It identifies suspicious tool metadata.
4. It classifies tools as read-only, state-changing or unknown.
5. It produces understandable recommendations.
6. Unsupported browsers and pages without tools fail gracefully.
7. The feature is labeled Experimental.
8. Existing page scanning remains unchanged and stable.
9. Tests, lint, type-check and production build pass.
10. Chrome Web Store wording does not claim universal WebMCP interception.

At the end, report:

- files changed
- WebMCP APIs used
- permission changes
- browser limitations
- security limitations
- test results
- release readiness
