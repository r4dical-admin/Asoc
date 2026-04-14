# INC-0978 Identity Federation Outage

- Severity: `SEV1`
- Closed: `2025-11-02`
- Root cause: expired signing certificate in the federation path

## Summary

Customer admin login and workforce authentication both degraded after a signing certificate expired and assertion validation failed across regions.

## Why it matters

- reference incident for auth-wide customer impact
- useful for timeline wording and region-by-region blast radius analysis
