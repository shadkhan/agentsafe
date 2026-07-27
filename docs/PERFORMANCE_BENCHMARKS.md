# Performance Benchmarks

Benchmark manually with generated fixtures:

```bash
powershell -ExecutionPolicy Bypass -File scripts/generate-fixtures.ps1
pnpm --filter @agentsafe/extension build
```

Load `apps/extension/.output/chrome-mv3` in Chrome and scan the generated pages under `fixtures/performance`.

Acceptance targets:

- Quick mode remains cancellable during extraction and scanning.
- Standard mode reports progress while scanning multi-megabyte pages.
- Deep mode can scan a generated 20 MB page without freezing the side panel.
- Partial statuses appear when configured size, node, chunk, or timeout budgets are reached.

Record measured wall-clock times, Chrome version, OS, and machine details in release notes before publishing a store build.
