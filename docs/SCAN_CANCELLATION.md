# Scan Cancellation

The side panel owns an `AbortController` per scan. Pressing Cancel:

- aborts the coordinator signal,
- sends `SCAN_ABORT` to the Worker,
- terminates the active Worker,
- marks the injected DOM traversal as cancelled with the scan id.

`runWorkerScan` rejects an active chunk immediately when the abort signal fires. The UI clears the active scanning state and reports cancellation. Findings produced before cancellation are treated as partial advisory results.
