# SIEM Source

Aggregated logs and correlations from central pipeline.

## Coverage

- auth, CDN, WAF, SaaS audit, and endpoint summaries
- search retention: 30 days hot, 365 days cold
- primary use: cross-source correlation and executive timeline generation

## Sample queries

- `index=auth-* failure_reason="invalid_password" | stats count by src_ip, country`
- `index=waf-* challenge_action=block AND uri_path="/login" | timechart count`

## Index locations

- `auth-*`
- `waf-*`
- `saas-audit-*`

## Notable fields

- `src_ip` - join key for IP clustering across auth and edge telemetry
- `geo.country_name` - used for affected-customer regional reporting
- `risk_score` - normalized detection score used by triage templates
