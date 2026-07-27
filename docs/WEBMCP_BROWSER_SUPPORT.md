# WebMCP Browser Support

WebMCP is experimental browser functionality.

AgentSafe detects support by checking whether the active page has `navigator.modelContext` and by looking for declarative WebMCP form candidates such as `form[toolname][tooldescription]`.

## Local Chrome Testing

For local development in Chrome:

1. Open `chrome://flags/#enable-webmcp-testing`.
2. Set the flag to Enabled.
3. Relaunch Chrome.
4. Open a page with WebMCP tools.
5. Run AgentSafe Scan from the side panel.

## Limitations

- Imperative tools registered before AgentSafe scans may not be discoverable unless the page or browser exposes inspectable metadata.
- Cross-origin iframe tools require browser permissions policy support from the embedding page.
- WebMCP requires a browsing context; AgentSafe does not inspect tools headlessly.
- Unsupported browsers are not treated as broken. AgentSafe continues ordinary page scanning.
