# SEV1 Business Email Compromise

Root cause: MFA fatigue and legacy IMAP allowance.

## Incident metadata

- Incident ID: `SEV1-2025-091`
- Start time: `2025-09-18T03:12:00Z`
- Detection source: executive mailbox forwarding alert
- Affected customers: `148`

## Summary

Attackers used repeated MFA prompts against an executive assistant, then pivoted through a legacy IMAP client that had not been blocked by conditional access. The compromise resulted in invoice-thread hijacking and partner outreach from a trusted mailbox.

## Notable analysis items

- per-country breakdown of affected customers and partners
- inbox-rule diff before and after token revocation
- legacy protocol usage timeline across the compromised account

## Lessons carried forward

- disable legacy mail protocols by default
- treat MFA fatigue plus mailbox forwarding as an automatic incident promotion
