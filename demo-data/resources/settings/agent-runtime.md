# Agent Runtime Settings

## Runtime defaults

- default model profile: balanced investigation runtime
- max concurrent background agents: `6`
- default sandbox mode: read-only until a template explicitly grants write actions

## Guardrails

- template-required context must load before the agent can execute its first tool
- high-risk actions pause for approval when severity or integration policy requires it
- every agent run writes a transcript and last-refresh timestamp back into the incident workspace
