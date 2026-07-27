# Performance Fixtures

Generate large local HTML fixtures with:

```bash
powershell -ExecutionPolicy Bypass -File scripts/generate-fixtures.ps1
```

Generated files:

- `large-quick.html`
- `large-standard.html`
- `large-deep.html`

These files are ignored by git because they are generated and can be several megabytes.
