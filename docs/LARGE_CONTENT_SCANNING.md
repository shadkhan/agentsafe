# Large Content Scanning

Large pages are handled with bounded extraction and chunked Worker scanning.

Scan modes:

- `quick`: up to 2 MB extracted text, 12,000 DOM nodes, 4,000 text nodes.
- `standard`: up to 5 MB extracted text, 35,000 DOM nodes, 12,000 text nodes.
- `deep`: up to 20 MB extracted text, 100,000 DOM nodes, 50,000 text nodes.

Extraction yields every 250 nodes to keep the inspected page responsive. Individual text nodes are truncated by mode, and chunk overlap preserves rule matching across boundaries. If a configured budget is reached, AgentSafe returns a partial status and keeps findings already produced.

Use `deep` only for explicit manual review of large or adversarial pages.
