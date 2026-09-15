# Templates

Response templates for containment and triage.

## Model overrides

Runner defaults come from the runner's local `.env` file. A workflow can override those defaults with non-secret top-level fields:

```yaml
ai_provider: gemini
ai_model: gemini-3.6-flash
```

Task-specific overrides belong in the task definition metadata under `context_refs_json.ai`.

## Index

- `auto-containment.yaml` - immediate containment workflow for identity or endpoint compromise.
- `incident-overview.md` - template for executive overviews and last-24-hours status-call slides.
- `lateral-movement.yaml` - deeper investigation workflow for post-compromise expansion.
- `periodic-updates.md` - template for recurring status updates during active incidents.
