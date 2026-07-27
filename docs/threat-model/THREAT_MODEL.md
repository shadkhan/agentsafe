# Threat Model

## Protected Assets

- User trust when copying webpage content into AI tools.
- Browser-agent instruction boundaries.
- Private prompts, cookies, tokens, and local browser data.
- Integrity of sanitized exported content.

## In Scope

- Hidden webpage instructions.
- Unicode obfuscation.
- Suspicious comments and metadata.
- Encoded instruction text.
- Prompt override and exfiltration language.

## Out of Scope

- Perfect maliciousness detection.
- Network traffic inspection.
- Server-side page changes after scanning.
- Attacks inside browser or extension vulnerabilities unrelated to page content.

## Mitigations

- Local-only scan and export.
- Explicit user action before scanning.
- Evidence-first reporting.
- No remote code or AI API.
- Minimal permissions.
