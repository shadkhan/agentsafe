# AgentSafe Architecture

See the root `ARCHITECTURE.md` for the system overview.

The MVP uses explicit active-tab script injection rather than a static all-URLs content script. This keeps scanning user initiated and avoids host permissions.

## Rule Taxonomy

- `hidden-css`: CSS or layout properties hide text from the user.
- `unicode-security`: zero-width and bidirectional control characters.
- `instruction-pattern`: prompt override, role manipulation, or prompt disclosure requests.
- `encoded-content`: base64-like text that decodes to readable instructions.
- `metadata`: suspicious meta-tag content.
- `html-comment`: suspicious HTML comments.
- `accessibility`: `aria-hidden` content containing instruction-like text.
- `exfiltration`: tool-use or data-exfiltration instructions.
- `delimiter`: prompt-like delimiter blocks.

## Scoring

The risk engine assigns weighted points for hidden, instruction, Unicode, encoded, metadata, and exfiltration signals. A phrase-only visible finding remains below high severity. Hidden text that is likely to enter extracted page text increases severity.
