# Architecture

AgentSafe is a small TypeScript monorepo. The extension UI uses `chrome.scripting.executeScript` only after the user presses Scan, Highlight, or Reveal. The scan action snapshots the active page, preserves relevant computed CSS properties, and then runs scanner, sanitizer, and exporter code locally in the side panel context.

No webpage body content is persisted. `chrome.storage.local` stores only settings. The production manifest has no host permissions and no static content scripts.

## Packages

- `@agentsafe/shared-types`: `Finding`, `ScanResult`, `SanitizedExport`, and settings types.
- `@agentsafe/risk-engine`: documented scoring algorithm and summary aggregation.
- `@agentsafe/scanner`: DOM, CSS, Unicode, comment, meta, encoded-content, and instruction-pattern detection.
- `@agentsafe/dom-sanitizer`: removes or neutralizes suspicious content while preserving visible page text.
- `@agentsafe/markdown-exporter`: extracts main content with Mozilla Readability and converts sanitized HTML to Markdown.

## Implementation Sequence

1. Define shared report and settings contracts.
2. Implement scanner rules and evidence extraction.
3. Implement risk scoring and severity thresholds.
4. Implement sanitizer and Markdown/JSON export.
5. Build WXT side panel with explicit scan action.
6. Add unit tests, fixtures, and E2E coverage.
7. Harden permissions and documentation before store submission.
