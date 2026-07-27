# Worker Release Hardening Validation

Validation commands run for this hardening pass:

```bash
pnpm install --frozen-lockfile
pnpm --filter @agentsafe/browser-scanner-adapter build
pnpm --filter @agentsafe/extension typecheck
pnpm --filter @agentsafe/extension build
pnpm typecheck
pnpm test
pnpm e2e
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm verify:clean
pnpm audit --audit-level moderate
```

Observed result:

- `pnpm verify:clean`: passed.
- `pnpm e2e`: 3 passed.
- `pnpm audit --audit-level low`: no known vulnerabilities.
- JavaScript tests: 103 passed.
- Rust tests: 14 passed.
- Extension production build includes packaged Worker and WASM assets.

Manual browser checks:

- Scan a small malicious fixture.
- Scan generated large fixtures in quick, standard, and deep modes.
- Cancel during extraction and during Worker scanning.
- Confirm partial status text is visible when budgets are exceeded.
- Confirm scoped exceptions suppress only intended rule/scope combinations.
- Confirm the extension output contains local Worker and WASM assets.
