# agentsafe-wasm

`agentsafe-wasm` exposes `agentsafe-core` through `wasm-bindgen`.

This crate is intended to be built by the npm package at `packages/scanner-wasm`.

## Build

From the repository root:

```powershell
pnpm --filter @agentsafe/scanner-wasm build
```

The generated wasm-pack output is written to:

```text
packages/scanner-wasm/pkg
```

## Test

Run the Rust workspace tests:

```powershell
cargo test --workspace
```

Run the independent JavaScript/WASM smoke tests documented in:

```text
crates/USER_MANUAL.md
```

## Publish

Most browser and JavaScript consumers should install the npm package:

```text
@agentsafe/scanner-wasm
```

Publishing this Rust bridge crate to crates.io is optional. If publishing it, publish `agentsafe-core` first and use a versioned `agentsafe-core` dependency in `Cargo.toml`.
