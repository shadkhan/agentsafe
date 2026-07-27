# WebMCP Security Overview

AgentSafe includes a minimal, passive, experimental WebMCP Security Scanner.

The scanner inspects WebMCP tool metadata exposed by the active page and never executes tools. It is intended to help users and developers review whether tool names, descriptions, schemas, examples, and annotations contain prompt-injection or sensitive-data risks before another browser agent considers using those tools.

## Scope

The first release inspects:

- Declarative WebMCP form metadata such as `toolname`, `tooldescription`, parameter descriptions, enum values, and annotations.
- Imperative tool metadata only when it is exposed to the page in an inspectable form, such as the local demo fixture's `window.__agentsafeWebMcpTools`.
- Browser support state through passive feature detection.

## Non-Goals

AgentSafe does not:

- Execute WebMCP tools.
- Intercept tool output.
- Align tool calls with an agent's private intent.
- Run a local MCP server.
- Block another browser agent.
- Send metadata to cloud services.
- Use LLM classification.

## Rust Core Boundary

The Rust scanner remains WebMCP-independent. The TypeScript WebMCP adapter converts tool metadata into generic structured scan requests.
