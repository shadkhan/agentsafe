# WebMCP Rules

AgentSafe applies deterministic rules to WebMCP tool metadata.

## Scanner Rules

Tool metadata is converted into structured scan input and passed to the existing Rust/WASM scanner. Human-readable strings are collected from:

- Tool name, title, and description.
- Parameter names and descriptions.
- Enum values.
- Examples.
- Input and output schema descriptions.
- Annotations.

## WebMCP-Specific Heuristics

- `webmcp-credential-request`: detects credentials, cookies, secrets, tokens, or session identifiers.
- `webmcp-unrelated-personal-data`: detects sensitive personal data requests.
- `webmcp-cross-origin-instruction`: detects cross-origin or third-party instruction language.
- `webmcp-hidden-unicode`: detects zero-width Unicode.
- `webmcp-bidi-control`: detects bidirectional Unicode controls.
- `webmcp-description-schema-mismatch`: detects read-only descriptions paired with state-changing schema language.
- `webmcp-unknown-action`: flags ambiguous tools without clear action semantics.

## Action Classification

Tools are classified as:

- Declared read-only.
- Likely read-only.
- State-changing.
- Sensitive state-changing.
- Unknown.

Classification is marked as inferred unless it comes from `readOnlyHint=true`.

## Decisions

- Benign declared read-only tool: Allow.
- Tool with `untrustedContentHint`: Allow with untrusted-content warning.
- Unknown or state-changing tool: Require confirmation.
- Tool requesting unrelated credentials: Block.
- Strong prompt injection in description: Block.
- Description/schema mismatch: Review.
