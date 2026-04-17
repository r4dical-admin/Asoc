# Tooling Deployments

## Investigation tools

- `edr-search-prod` - primary endpoint and memory hunting deployment
- `siem-core-prod` - central correlation and timeline generation cluster
- `artifact-store-ir` - evidence bundle storage used by background agents

## Operational notes

- background agents should prefer read-only credentials for data collection
- memory analysis workers are allowed to write only to the evidence artifact store
- Slack and Jira bridge actions require incident commander approval in SEV1 workflows
