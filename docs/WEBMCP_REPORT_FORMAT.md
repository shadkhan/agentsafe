# WebMCP Report Format

WebMCP reports can be exported as JSON or Markdown.

## JSON Fields

- `pageUrl`
- `pageOrigin`
- `scanTimestamp`
- `browserSupport`
- `agentSafeVersion`
- `scannerEngineVersion`
- `tools`
- `scanCompleteness`

Each tool result includes:

- `tool`
- `classification`
- `decision`
- `riskScore`
- `confidence`
- `reasons`
- `findings`
- `origin`
- `scanCompleteness`

## Redaction

Exports redact common credential evidence such as password, token, secret, cookie, session, and API key values. Redaction is best-effort and local.
