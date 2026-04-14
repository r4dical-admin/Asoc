# TASK-427 API Abuse IOC Enricher

- Incident: `INC-1003`
- Owner: `ioc-enricher`
- Status: Complete
- Last refresh: `2026-04-14T08:42:00Z`

## Assigned template

This background task used the `partner-api-abuse` template because the inbound alert indicated:

- high-volume scraping from a partner token
- successful requests across multiple low-signal endpoints
- request cadence that resembled automated tooling

## Findings

- token was scoped to read-only but still exposed broad customer metadata
- request clusters originated from three cloud regions in under twenty minutes
- user agent strings rotated between commodity browser signatures and scripted HTTP clients

## Transcript

`08:18Z` Pulled request samples, partner account profile, and rate-limit policy.

`08:27Z` Identified overlapping infrastructure with a previous scraping event from February.

`08:42Z` Published IOC set and recommended tighter per-endpoint quota rules.
