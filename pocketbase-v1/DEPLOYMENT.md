# Deployment and operations

V1 deploys one PocketBase container and one or more runner containers per tenant. Route each tenant hostname to its own PocketBase service; for example, `acme.asoc.example` maps only to Acme's container and named data volume. Runner credentials and integration configurations are tenant-specific.

## Secrets

Generate `ASOC_RUNNER_PASSWORD`; inject the same value into PocketBase during initial migration and into its runners. Store AI keys, GitHub/Jira webhook secrets, GitHub tokens, and MCP tokens only in a secret store or runner environment. Settings records contain provider names, models, URLs, and names of environment variables; they never contain secret values.

Docker/Podman can use an untracked `runner/.env`. In Kubernetes, use a Secret and `envFrom.secretRef`; keep the deployment manifest limited to non-secret configuration. Rotate a runner secret by creating a replacement service account, rolling runners to the new credential, and disabling the old account.

## Backup and restore

PocketBase recommends backing up while writes are quiesced. Put runners in draining mode, stop the tenant PocketBase container, and archive the named volume. With Podman:

```sh
podman stop asoc-runner-v01 asoc-pocketbase-v01
podman volume export asoc-pocketbase-v01-data --output asoc-pocketbase-v01-data.tar
```

Restore into a new empty named volume, start PocketBase, confirm migrations and `/api/health`, and then start the runner. Test restores regularly and protect backup files as tenant data.

## Superuser bootstrap

Application users do not need PocketBase superuser access. For local maintenance only, create a superuser interactively inside the container with `pocketbase superuser upsert`; do not place its password in source or scripts. The application bootstrap user is `admin` / `password` by default and must change that password before any application data is exposed.

## External sign-in providers

V1 uses local accounts. For V2, enable Google, GitHub, or the generic OIDC provider under the `users` collection's OAuth2 options in the PocketBase dashboard and inject each client secret through deployment configuration. The frontend discovers enabled providers and renders their login buttons automatically. The server hook refuses OAuth sign-up: the provider must return a verified email matching an active user that an administrator already invited. Okta uses the generic OIDC provider and its authorization, token, user-info, and issuer endpoints.

## Intake configuration

GitHub intake configurations specify selected `repositories`, `secret_env`, and `token_env`. Configure GitHub to deliver pull-request webhooks to `/webhooks/{intake-config-id}` on the runner intake port; opened, reopened, edited, and synchronized PR events create triage tasks, and the runner fetches the exact diff.

Jira Cloud configurations specify `site`, selected `projects`, and `secret_env`; send issue webhooks to the same path with a bearer secret. Generic alerts use `kind: webhook`. Scheduled hunts use `kind: cron` with `cron`, `timezone`, and an `input` object. All retries share a unique delivery key and resolve to one intake record.

MCP connections use `kind: mcp` and a configuration with `url` plus optional `token_env`. Playbooks choose each discovered tool by its configuration ID and tool name, and set its policy to `deny`, `allow`, or `require_approval`.
