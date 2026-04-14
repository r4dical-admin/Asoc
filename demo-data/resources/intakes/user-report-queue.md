# User Report Queue

Pending reports from employee phishing submissions.

## Transports

- shared phishing-report mailbox
- Slack security hotline
- Jira incident intake form

## Template routing

- suspicious consent prompt report -> `oauth-token-abuse`
- account lockout plus login prompt flood -> `credential-stuffing-web-auth`
- report of unexplained data export -> `partner-api-abuse`

## Triage guidance

Analyst and agent triage should prioritize the richest transport first, then attach supporting evidence from the other channels. The chosen template should reflect the likely attack mechanism, not just the transport where the report arrived.
