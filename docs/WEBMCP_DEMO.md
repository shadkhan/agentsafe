# WebMCP Demo

Open the local demo page:

```text
fixtures/webmcp/demo.html
```

The demo contains:

- One benign read-only WebMCP tool.
- One benign state-changing tool.
- One suspicious tool description.
- One tool requesting unnecessary credentials.
- One tool with hidden Unicode.
- One tool with `untrustedContentHint`.

## Manual Test

1. Build the extension.
2. Load `apps/extension/.output/chrome-mv3` in Chrome.
3. Enable file URL access for AgentSafe if opening the fixture from disk.
4. Open `fixtures/webmcp/demo.html`.
5. Open AgentSafe and click Scan.
6. Select the Experimental WebMCP tab.

Expected result: AgentSafe lists WebMCP tools, classifies them, and provides deterministic decisions without executing any tool.
