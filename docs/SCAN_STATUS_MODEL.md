# Scan Status Model

`ScanMetrics.status` communicates completeness:

- `complete_within_configured_limits`: all queued work completed within configured budgets.
- `partial_size_limit`: extraction reached the configured character budget.
- `partial_node_limit`: extraction reached DOM or text-node budgets.
- `partial_chunk_limit`: chunk queue reached the configured chunk budget.
- `partial_finding_limit`: finding cap reached.
- `partial_rule_timeout`: one or more chunks timed out and were skipped after Worker recovery.
- `partial_worker_failure`: Worker failures exceeded the restart budget, or max scan duration was reached.
- `cancelled`: user cancelled the scan.
- `failed`: unrecoverable scan failure.

Partial scans do not invalidate findings already returned. Consumers should display the status and `partialReasons` beside the findings.
