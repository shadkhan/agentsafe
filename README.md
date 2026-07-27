# AgentSafe - Prompt Injection Detector

AgentSafe is a local-only Manifest V3 Chrome extension that scans the current page for hidden, encoded, Unicode-obfuscated, metadata-based, or instruction-like content that may affect AI agents and web-to-LLM workflows.

It does not use a backend, authentication, telemetry, analytics, remote code, or external AI APIs. Detection is advisory, not a guarantee of safety.

## MVP Features

- Explicit user-triggered page scanning.
- Finding evidence, selector, explanation, confidence, severity, visibility, and extraction-likelihood fields.
- CSS hidden-text checks, Unicode security checks, suspicious comments/meta tags, base64-like instruction decoding, delimiter and exfiltration patterns.
- Local scoring engine that requires multiple signals for high confidence.
- Page highlighting, finding navigation, and temporary reveal of hidden content.
- Sanitized Markdown and JSON report export.
- Local settings in `chrome.storage.local`.

## Development

```bash
pnpm install
pnpm test
pnpm --filter @agentsafe/extension dev
pnpm --filter @agentsafe/extension build
```

Load `apps/extension/.output/chrome-mv3` from `chrome://extensions`. To scan local fixture files, open AgentSafe's extension details and enable "Allow access to file URLs".

## Structure

- `apps/extension` - WXT React side panel and MV3 extension entrypoints.
- `packages/scanner` - DOM and text scanner.
- `packages/risk-engine` - scoring and severity mapping.
- `packages/dom-sanitizer` - local DOM cleanup.
- `packages/markdown-exporter` - Readability extraction and Markdown/JSON report generation.
- `packages/shared-types` - public data contracts.
- `fixtures` - benign and malicious regression pages.
- `docs` - architecture, threat model, privacy, and Chrome Store docs.
