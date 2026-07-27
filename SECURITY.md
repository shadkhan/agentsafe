# Security

AgentSafe is designed for local inspection of untrusted webpages.

Security constraints:

- No remote code.
- No `eval`.
- No backend calls.
- No analytics or telemetry.
- No external AI API.
- Minimal MV3 permissions.
- Findings always include evidence and rationale.
- UI rendering relies on React escaping and sanitized export content.

Report vulnerabilities by opening a private security advisory in the project repository once published.
