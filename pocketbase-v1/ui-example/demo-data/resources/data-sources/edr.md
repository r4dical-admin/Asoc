# EDR Source

Primary endpoint telemetry from fleet sensors.

## Coverage

- fleet: macOS, Windows, and Linux corporate endpoints
- refresh cadence: event streaming with 30-second search availability target
- primary use: process lineage, memory triage, persistence checks

## Sample queries

- `process_name:"osascript" AND parent_process_name:"loginwindow"`
- `dns.question:* AND process_name:"python3" AND host_risk_score:>70`

## Index locations

- `edr-process-*`
- `edr-network-*`
- `edr-alerts-*`

## Notable fields

- `host.id` - stable endpoint identifier used across enrichment joins
- `process.command_line` - best field for spotting suspicious launch context
- `user.email` - analyst-friendly owner mapping for blast-radius summaries
