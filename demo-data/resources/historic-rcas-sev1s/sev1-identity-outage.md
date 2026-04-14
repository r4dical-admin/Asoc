# SEV1 Identity Outage

Root cause: expired signing certificate in identity federation path.

## Incident metadata

- Incident ID: `SEV1-2025-117`
- Start time: `2025-11-02T14:05:00Z`
- Detection source: login failure saturation alert
- Impacted countries: `US, IL, DE, AU`

## Summary

Federated login failures spiked after an expired signing certificate stopped assertions from validating in the primary identity path. Workforce and customer admin access both degraded until the certificate chain was rotated and caches were flushed.

## Notable analysis items

- tenant-by-tenant authentication failure counts
- customer concentration by country and product tier
- certificate expiry audit gap between staging and production
