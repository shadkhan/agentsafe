# Worker Failure Recovery

Each chunk scan has a mode-specific timeout. On chunk timeout or Worker error, AgentSafe:

1. records the chunk id in `timedOutUnits`,
2. increments `chunksSkipped`,
3. terminates the Worker,
4. starts a new Worker when restart budget remains,
5. continues with the next chunk.

If restart budget is exhausted, status becomes `partial_worker_failure`. If only a chunk timeout occurred and scanning could continue, status becomes `partial_rule_timeout`.
