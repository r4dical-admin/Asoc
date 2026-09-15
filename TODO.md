# Todo

## V1 — Authentication

- [x] Support email invitations for local PocketBase email/password users; disable public self-registration.
- [x] Provide a bootstrap application admin with default username/password `admin` / `password`, requiring a password change on first login.
- [x] Enforce application roles: admin, analyst, and read-only.

## V1 — Integrations

- [x] Integrate GitHub PRs as an intake channel: review any opened or updated PR in selected repositories, passing PR descriptions and diffs into security-review triage.
- [x] Integrate Jira Cloud intake with configurable projects. Define Jira output actions at the playbook level and enforce them through MCP tool policies.

## V1 — Intake Triage and Deduplication

- [x] Assign each intake a triage playbook that defines its deduplication/correlation rules for PRs, issues, and alerts.
- [x] Give the triage agent/runner tools to find relevant existing incidents and inspect source IDs, revisions, and prior triage decisions as evidence under the intake's playbook.
- [x] Support three triage outcomes: add a comment to an existing incident; create a new incident, select its playbook, and kick it off; or ignore the intake and log the reason.
- [x] Persist every triage decision in an intake decision log, including ignored items, with the intake/run ID, playbook version, rationale, and any resulting incident/task links.
- [x] Make delivery retries and triage side effects idempotent without replacing the playbook's incident deduplication decision with fixed source-key rules.

## V1 — Playbook MCP Tool Policies

- [x] Configure each playbook's MCP tools as `deny`, `allow`, or `require_approval`; unspecified tools default to deny, and profile restrictions remain an upper bound.
- [x] Enforce policy at each MCP invocation. For `require_approval`, pause execution and show the exact tool and arguments for authorized approval; record the decision before execution.
- [x] Allow analysts to approve MCP actions for the current task/session only; approvals must not grant access in other tasks/sessions or change persistent playbook policy. Read-only users cannot approve.
- [x] Add settings for MCP connections and playbook tool policies. Jira output behavior belongs in playbooks.

## V2 — Authentication

- [x] Support generic OpenID Connect (OIDC) sign-in, including Okta.
- [x] Support Google sign-in through PocketBase OAuth2.
- [x] Support GitHub sign-in through PocketBase OAuth2.

## Deferred — GitHub Output

- [x] Wire GitHub output through a skill and MCP configuration in settings. Defer dedicated output implementation until the configuration needs are established.

## V0.1 — POC Usability Gaps

- [x] Replace frontend-only playground chats with persisted backend chat sessions.
- [x] Route playground chat messages through runner-backed AI execution instead of local placeholder replies.
- [x] Support incident-scoped chat sessions as real task/session records with durable transcripts.
- [x] Show assistant streaming output in chat and task views as it arrives.
- [x] Add empty/loading/error states that explain when PocketBase, runner, or AI config is missing.
- [x] Add a visible runtime health panel for PocketBase, active runners, AI provider, and model.

## V0.1 — Model Provider Configuration

- [x] Keep provider API keys only in runner/backend `.env` files or deployment secret stores.
- [x] Use Gemini as the current default provider with `gemini-3.6-flash`.
- [x] Support runner default provider/model from environment variables.
- [x] Support playbook-level provider/model overrides with non-secret `ai_provider` and `ai_model` fields.
- [x] Support task-definition provider/model overrides through `context_refs_json.ai`.
- [x] Add validation for unknown providers, missing models, and missing API keys before task execution.
- [x] Add redaction so lifecycle logs never persist API keys, Authorization headers, or secret-bearing env values.
- [x] Add a Settings UI that edits non-secret provider/model defaults only; secrets must stay server-side.
- [x] Wire real Gemini streaming execution through its OpenAI-compatible endpoint while preserving OpenAI, generic compatible, and Ollama model/tool execution.

## V0.1 — Backend Intakes

- [x] Create first-class intake collections instead of storing intakes only as resource markdown.
- [x] Implement manual/user-report intake creation from the UI.
- [x] Implement scheduled/cron intake creation for recurring hunts.
- [x] Implement alert/webhook intake creation for external alert sources.
- [x] Connect intake records to triage playbooks and resulting incidents/tasks.
- [x] Persist intake triage decisions, including ignored/deduplicated/new-incident outcomes.
- [x] Make intake processing idempotent across retries and duplicate source events.

## V0.1 — Runner Execution

Source roadmap: `pocketbase-v1/RUNNER_LOOP.md`.

- [x] Replace the mock delegate with a real AI delegate path for Gemini/OpenAI-compatible APIs.
- [x] Split mock delegate, AI delegate, and future container delegate into explicit launch modes.
- [x] Persist prompt bundles, raw outputs, and normalized artifacts safely for review.
- [x] Add per-task timeout handling.
- [x] Add user cancellation for queued/running tasks.
- [x] Add retry handling with retry counts, backoff, and final failure states.
- [x] Recover stale claimed/running attempts on runner startup.
- [x] Add lease/heartbeat checks so dead runners do not strand tasks.
- [x] Separate scheduler polling from execution supervision.
- [x] Support multiple concurrent tasks up to runner capacity.
- [x] Add per-task delegate container launch when moving beyond the in-process POC.

## V0.1 — Runner Enrollment

- [ ] Replace the shared `ASOC_RUNNER_PASSWORD` bootstrap with admin-created, expiring, single-use runner enrollment tokens stored only as hashes.
- [ ] Add admin APIs and UI to create, list, and revoke enrollment tokens; reveal a new token only once.
- [ ] Have each runner generate a strong local credential, enroll with its token, and persist the credential in a mode-`0600` file or deployment secret.
- [ ] Create a dedicated PocketBase service identity for every enrolled runner and bind its registration, leases, lifecycle events, and artifacts to that authenticated identity.
- [ ] Support runner credential rotation and administrative revocation without affecting other runners.
- [ ] Remove the first-runner dependency from backend startup and retain a documented migration path for deployments using the legacy shared runner account.

## V0.1 — Playbooks and Task Definitions

- [x] Define the canonical playbook schema for model settings, required context, tools, approvals, and outputs.
- [x] Parse YAML playbooks robustly instead of relying on minimal top-level line parsing.
- [x] Add task definition files or records that can specify playbook, role, priority, context refs, and AI override.
- [x] Show selected playbook, model provider, and model on each task detail tab.
- [x] Add playbook validation errors before tasks are queued.
- [x] Add sample playbooks for playground chat, incident triage, periodic updates, and status-call generation.

## V0.1 — Auth and Admin

- [x] Implement real app login/logout using PocketBase auth collections.
- [x] Disable public self-registration and support invited users only.
- [x] Bootstrap the first app admin safely and require first-login password change.
- [x] Add admin/analyst/read-only role enforcement in the UI.
- [x] Replace permissive local demo collection rules with authenticated PocketBase API rules.
- [x] Add runner/service authentication instead of anonymous runner writes.
- [x] Add local-only PocketBase superuser bootstrap documentation or script without committing credentials.

## V0.1 — Local Dev and Deployment

- [x] Make `run-v01.sh` work on machines with only Podman, without requiring `podman-compose`.
- [x] Add a clean start/reset command that clears queued/running seed tasks safely.
- [x] Add a seeded “no active tasks” POC mode for demos.
- [x] Add persistent named volumes and backup/restore instructions.
- [x] Add production-like secret injection examples for Docker/Podman/Kubernetes.
- [x] Add subdomain/tenant routing plan for one PocketBase container per tenant.
- [x] Add smoke tests for PocketBase migrations, frontend build, runner claim/execution, and AI delegate config.
- [x] Resolve frontend dependency vulnerabilities or document accepted risk for v0.1.

## V0.1 — UX Polish

- [x] Add task creation form instead of only “Queue Task” buttons.
- [x] Add intake creation and intake review screens.
- [x] Add settings screens for users, runners, model defaults, and integrations.
- [x] Add task filters by status, incident, runner, role, and playbook.
- [x] Add transcript/artifact download from task detail views.
- [x] Add clear indicators for mock mode vs real AI mode.
- [x] Add tab improvements: reorder, split-pane compare, unsaved indicators, and per-incident grouping.

## Release Acceptance

Items marked **E2E required** must pass before the build is considered end-to-end ready.

- [ ] **E2E required:** Configure SMTP and verify the complete email invitation flow, including accepting the link, choosing a password, signing in, and applying the assigned role.
- [x] **E2E required:** Verified a real Gemini task on 2026-09-15 with `gemini-3.6-flash`, streamed output, a durable chat transcript, prompt/raw/result artifacts, and successful completion.
- [ ] **E2E required:** Create a one-time runner enrollment token as an admin, enroll a clean runner without `ASOC_RUNNER_PASSWORD`, verify the token cannot be reused, restart using the persisted credential, then revoke it and confirm access stops.
- [ ] **E2E required for each enabled model backend:** Run a streamed task with OpenAI and Ollama, including at least one MCP tool call, after those backends are enabled for deployment.
- [ ] **E2E required:** Configure a GitHub repository, webhook secret, and token; verify opened and updated PR events, diff retrieval, retry deduplication, and the resulting triage decision.
- [ ] **E2E required:** Configure Jira Cloud with selected projects and a webhook secret; verify issue intake, project filtering, retry deduplication, and playbook-driven triage.
- [ ] **E2E required:** Configure at least one MCP server and verify `deny`, `allow`, and `require_approval`, including analyst approval scoped to the current task/session and a real tool result.
- [ ] **E2E required for each enabled provider:** Configure and verify Google, GitHub, and Okta/generic OIDC sign-in using an already invited account; confirm that uninvited identities cannot register.
- [ ] **E2E required:** Run browser acceptance across login, first-login password change, chat streaming, task creation/cancellation, intake review, approvals, settings, downloads, and read-only restrictions.
- [x] Reviewed the full worktree, removed generated and unintended files, and prepared a clean commit for review.
- [x] Clean-install smoke test passed on 2026-09-15 with `pocketbase-v1/scripts/smoke-test.sh`: migrations, auth, intake idempotency, persisted chat, atomic claims, cancellation, frontend build, and runner tests.
