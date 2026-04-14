# Cron Tasks

Scheduled template runs that kick off on a fixed cadence instead of waiting for a transport event.

## Schedule-driven sources

- hourly auth anomaly sweep
- every-4-hours risky OAuth consent review
- nightly partner API abuse hunt

## Template routing

- hourly auth anomaly sweep -> `credential-stuffing-web-auth`
- risky OAuth consent review -> `oauth-token-abuse`
- nightly partner API abuse hunt -> `partner-api-abuse`

## Kickoff behavior

Each cron task opens a fresh intake item with:

- the cron name and scheduled run time
- the last successful run time
- links to the exact data sources and template docs the background agent should load

## Triage guidance

Cron-driven intakes should skip the transport-selection step and go straight to the mapped template unless the scheduled query returns evidence that points to a different attack shape. When that happens, the triage agent should record why it overrode the scheduled template choice.
