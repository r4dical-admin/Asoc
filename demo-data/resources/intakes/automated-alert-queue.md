# Automated Alert Queue

SIEM and EDR generated alerts awaiting assignment.

## Transports

- webhook listener for detector outputs
- SIEM scheduled-search alerts
- EDR high-severity notification stream

For recurring time-based runs that should kick off a template on a fixed cadence, use `cron-tasks.md` instead of this intake.

## Template routing

- auth anomaly alerts -> `credential-stuffing-web-auth`
- risky OAuth consent alerts -> `oauth-token-abuse`
- partner API scraping alerts -> `partner-api-abuse`

## Triage guidance

If multiple templates could apply, prefer the one whose required data sources and workflow steps match the alert payload most closely. The triage agent should load only the mapped workflow, relevant RCA notes, and the data source documents referenced by that template.
