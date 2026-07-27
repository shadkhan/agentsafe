# Clean Build Verification

Run the complete local gate:

```bash
pnpm verify:clean
```

The script performs:

- frozen pnpm install,
- Rust format check,
- Rust clippy,
- Rust tests,
- TypeScript typecheck,
- JavaScript tests,
- extension production build,
- output check for a local WASM asset,
- output check for local machine path leaks.

Expected production artifacts include `assets/scan-worker-*.js` and `assets/agentsafe_wasm_bg-*.wasm`.
