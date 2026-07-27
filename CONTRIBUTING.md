# Contributing

Contributions should preserve the local-only security model.

Before submitting changes:

```bash
pnpm test
pnpm typecheck
pnpm --filter @agentsafe/extension build
```

Rule changes should include benign and malicious fixtures, unit tests, and a short explanation of false-positive risk.
