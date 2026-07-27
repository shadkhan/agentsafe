# Scan Limits

Configured limits live in `packages/browser-scanner-adapter/src/index.ts` as `SCAN_LIMITS`.

Mode budgets:

| Mode | Text | Chunk size | Chunk timeout | Restarts | Findings |
| --- | ---: | ---: | ---: | ---: | ---: |
| quick | 2 MB | 64 KB | 250 ms | 1 | 250 |
| standard | 5 MB | 128 KB | 750 ms | 2 | 1,000 |
| deep | 20 MB | 256 KB | 2,000 ms | 2 | 5,000 |

The Worker enforces a hard 512 KB chunk text limit. The Rust scanner also receives structured scan limits for input bytes, match counts, object depth, field count, and string length.
