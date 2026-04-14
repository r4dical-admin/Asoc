# INC-0884 Cloud Storage Token Leak

- Severity: `SEV2`
- Closed: `2025-07-14`
- Root cause: build log exposure of a long-lived service token

## Summary

A deployment log published a cloud storage token that allowed read access to a restricted artifact bucket until the token was rotated and dependent pipelines were reconfigured.

## Why it matters

- strong reference for secrets exposure and containment sequencing
- helpful archived case for token rotation and evidence preservation steps
