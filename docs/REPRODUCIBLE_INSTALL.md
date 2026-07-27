# Reproducible Install

The repository pins package manager and toolchain files:

- `packageManager`: `pnpm@10.33.2`
- `.nvmrc`: `25.9.0`
- `.node-version`: `25.9.0`
- `rust-toolchain.toml`: Rust `1.97.1`
- `pnpm-lock.yaml`: required for frozen install

Use:

```bash
pnpm install --frozen-lockfile
```

Release validation should fail if the lockfile is missing or out of sync.
