# WebMCP Threat Model

WebMCP exposes structured tool metadata to browser agents. That metadata can influence which tools an agent chooses and what inputs it provides.

## Risks Covered

- Prompt override instructions in tool descriptions.
- Role manipulation.
- Requests to reveal system prompts.
- Credential, cookie, token, or session requests.
- Unrelated personal-data requests.
- Data-exfiltration instructions.
- Suspicious cross-origin instructions.
- Hidden Unicode and bidirectional Unicode controls.
- Encoded suspicious instructions.
- Misleading differences between tool name, description, and schema.

## Trust Boundaries

AgentSafe treats page-provided WebMCP metadata as untrusted page content. A tool's `readOnlyHint` is useful but not proof that the implementation is safe.

## Out of Scope

- Runtime enforcement of another agent's actions.
- Verification of server-side effects.
- Tool-output security.
- LLM intent alignment.
- Third-party script attribution.
