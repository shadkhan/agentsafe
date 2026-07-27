# Manifest, Worker, and WASM Packaging

AgentSafe must not fetch scanner code from the network. The production extension package must include local assets:

- `assets/scan-worker-*.js`
- `assets/agentsafe_wasm_bg-*.wasm`

Verify with:

```bash
pnpm --filter @agentsafe/extension build
Get-ChildItem apps/extension/.output/chrome-mv3 -Recurse
```

The side panel imports the Worker URL through Vite's `?worker&url` handling. The Worker imports `@agentsafe/scanner-wasm`, which imports the WASM binary as a bundled asset URL.
