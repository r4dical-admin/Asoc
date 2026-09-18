# Asoc PocketBase + Svelte Architecture (New Direction)

This folder is the new source of truth for the platform direction.
It defines a **PocketBase-per-tenant model** and a **separate agent runner/delegate container**.

## 1) Core Model (What we are building)

- Each tenant gets a **dedicated PocketBase container**.
- Each tenant will map to its own **subdomain** later (for example: `tenant-a.example.com`).
- PocketBase is the tenant's **all-in-one backend** for:
  - auth/session handling,
  - operational metadata/data collections,
  - task queue collections,
  - task lifecycle tracking,
  - API surface for the SPA,
  - serving the compiled Svelte SPA static files.
- V1 user access uses email invitations and local PocketBase email/password accounts; public self-registration is disabled. Bootstrap application credentials are `admin` / `password`, with a mandatory first-login password change. Roles are admin, analyst, and read-only.
- OIDC (including Okta), Google, and GitHub sign-in are deferred to V2.
- Agent execution is handled by one or more separate **Runner/Delegate containers**.

A minimal deployment is only **two containers per tenant**:
1. PocketBase container
2. Runner/Delegate container

You can attach additional runners at any time to increase throughput/capacity.

## 2) Runtime Roles

### PocketBase container (per tenant)

- Hosts tenant data collections and auth.
- Stores tasks and task lifecycle records.
- Emits real-time events for new tasks and lifecycle updates.
- Serves compiled Svelte SPA assets directly.
- Exposes APIs used by UI and runners.

### Svelte SPA (frontend application)

- Frontend stack is **Svelte** (SvelteKit or Vite+Svelte, output as static assets).
- Build output is deployed into each tenant PocketBase container's public/static directory.
- UI behavior and structure should mirror the included demo interaction model.

### Runner/Delegate container (shared image, many instances)

- Connects to tenant PocketBase.
- Listens for new queued tasks.
- Claims task safely.
- Pulls:
  - task context files,
  - assigned agent profile,
  - selected workflow/template details.
- Executes the task for any role (`triage`, `analysis`, `chat`, future custom roles).
- Writes lifecycle transitions back to PocketBase collections.
- Opens an interactive websocket channel when execution starts so users can stream/view `stdin/stdout` interactions live.

## 3) Data + Storage

- **Primary storage**: PocketBase collections/files.
- **Markdown content storage**: use PocketBase **Files** fields for markdown documents (incident sections, templates/workflows, resource docs) instead of relying on local filesystem markdown at runtime.
- **S3 usage is optional**:
  - Keep all data in PocketBase for simple deployments.
  - Enable S3 only when artifact volume/retention/egress requirements justify external object storage.

## 4) Design + Interaction Guidelines (from demo app)

The UI behavior should preserve the demo app's interaction model:

- 3-pane layout:
  - Left: active incidents + background tasks
  - Center: browser-style workspace tabs
  - Right: knowledge/resources surface
- Incident-first navigation with collapsible trees.
- Background tasks shown as first-class objects with independent tabs.
- File-backed resources/templates browseable from the right pane.
- Multiple open tabs and fast context switching.
- Markdown content render toggle (raw vs rendered) where available.

## 5) UI Example Included

A copy of the current static UI demo is included under:

- `pocketbase-v1/ui-example/interface-example.html`
- `pocketbase-v1/ui-example/demo-data/`

Run it locally from repo root:

```bash
python3 -m http.server 4173
```

Then open:

- `http://localhost:4173/pocketbase-v1/ui-example/interface-example.html`

## 6) Suggested First Build Slice

1. Spin up one tenant PocketBase container with baseline collections.
2. Stand up one Runner/Delegate container.
3. Implement queue claim + lifecycle updates (`queued -> running -> succeeded|failed|canceled`).
4. Add websocket streaming channel for live `stdin/stdout`.
5. Point SPA API calls to PocketBase endpoints for incidents/tasks/resources.

For detailed contracts, see `pocketbase-v1/SPECS.md`.

## 7) Initial Implementation Scaffold (included)

This folder now includes executable scaffolding for the v1 model:

- `pocketbase-v1/frontend/` — Svelte + Vite SPA that:
  - reads incidents/tasks/resources from PocketBase collections,
  - loads markdown from PocketBase **file fields** (for example `resources.body_md_file`),
  - renders markdown content in center tabs.
- `pocketbase-v1/runner/` — authenticated runner that atomically claims work, renews leases, executes concurrent mock, AI, or container delegates, streams lifecycle output, enforces MCP policy and approvals, and handles cancellation, timeouts, retries, and stale attempts.

Triage profiles include built-in tools to search incidents, open an internal incident and launch a selected response
playbook, add an intake note to an existing incident, or ignore an intake with a recorded rationale. Each final action
is atomic and deduplicated by intake. External ticket systems such as Jira are connected as MCP tools and enabled
per playbook with `allow` or `require_approval`.

## 8) v0.1 local stack

The fastest full local path runs the tenant PocketBase container and the runner container together:

```bash
cd /Users/ido/Documents/asoc/Asoc/pocketbase-v1
./scripts/run-v01.sh
```

Open:

- Frontend + PocketBase API: `http://127.0.0.1:8090`
- PocketBase admin setup: `http://127.0.0.1:8090/_/`

The application is invite-only. Sign in initially with `admin` / `password` and replace the password when prompted. The startup script creates `runner/.env` when needed, generates a strong runner password, stores the file with mode `0600`, and starts the first runner. Collection rules require authenticated users or the service account, and roles limit mutations.

Runner model defaults live in the runner's untracked `.env` file. Copy `runner/.env.example` to `runner/.env`,
set `AI_PROVIDER=gemini`, keep `GEMINI_API_KEY` only in that local file, and set `AI_MODEL` to the default Gemini
model. Individual task definitions can override the model with `context_refs_json.ai.model`. Playbooks/templates can
override the model with top-level `ai_provider` and `ai_model` fields in their workflow definition files.

The real delegate uses the OpenAI-compatible streaming chat and function-tool contract across all supported backends:

- Gemini: `AI_PROVIDER=gemini`, `GEMINI_API_KEY=...`, and a Gemini model such as `gemini-3.6-flash`.
- OpenAI: `AI_PROVIDER=openai`, `OPENAI_API_KEY=...`, and an OpenAI model.
- Ollama: `AI_PROVIDER=ollama`, an installed model in `AI_MODEL`, and optionally `OLLAMA_BASE_URL`. Local runners default to `http://127.0.0.1:11434/v1`; a containerized runner normally needs `http://host.containers.internal:11434/v1`.
- Other compatible services: `AI_PROVIDER=openai-compatible`, `AI_BASE_URL=...`, `AI_API_KEY=...`, and `AI_MODEL=...`.

Provider URLs can be overridden with `GEMINI_BASE_URL`, `OPENAI_BASE_URL`, or `OLLAMA_BASE_URL`. Model responses stream into task lifecycle events and chat transcripts, and MCP function calls continue through the same playbook policy and approval path for every backend.

Smoke-test a clean build, migrations, auth, intake routing, chat, authoring drafts, incident permissions, frontend, and runner execution:

```bash
./scripts/smoke-test.sh
```
4. Type into `Send Input` while the task is running to append stdin events.
5. Confirm the runner marks the task `succeeded` and the UI updates within a few seconds.

### Assisted authoring and integration discovery

Admins can create or edit resources and playbooks from the catalog. The structured editor retains Markdown instructions, advanced JSON, and explicit validation. The assistant queues a `TPL-AUTHORING` task, receives a bounded, redacted configuration snapshot, and has no tools. Accepting a proposal populates the editor; saving is a separate action. In mock mode, the proposal is labeled as a demonstration and does not claim to be model analysis.

Analysts can regenerate incident overviews from incident sections, recent notes, task results, and relevant result/evidence artifacts. Proposals are stored separately. Replacing an overview requires explicit acceptance and fails if the source overview changed. Draft access is checked against the requester and current incident permissions, including immediately before the runner prepares context.

Authoring uses `/api/asoc/authoring/context`, `/validate`, `/save`, and `/drafts`; the UI shows the recorded context used for generation. Resource edits use revision checks, and playbook saves increment their version. Task transcripts, artifacts, and approvals follow the associated task's incident access rules.

**Settings → MCPs / Integrations** manages connections and credential environment-variable names. The runner periodically discovers tools on enabled MCP connections, records availability and tool names, and closes discovery connections afterward. Tool discovery grants no execution permission: both the agent profile and playbook policy must allow a tool. Real MCP/provider connectivity requires the appropriate runner environment and deployment acceptance checks.

The smoke suite runs entirely against disposable containers and a disposable database. It checks successful and denied access, revoked incident membership, Unicode files, stale drafts, explicit application, and both resource and incident authoring through the mock runner.

### Frontend quick start

```bash
cd pocketbase-v1/frontend
npm install
npm run dev
```

Environment:

- `VITE_POCKETBASE_URL` (default: `http://127.0.0.1:8090`)

### Local Podman quick start

Use this to start PocketBase, the compiled Svelte frontend, and the first runner without installing PocketBase locally:

```bash
cd /Users/ido/Documents/asoc/Asoc/pocketbase-v1
./scripts/podman-run.sh
```

The helper builds and starts `asoc-pocketbase-v1` and `asoc-runner-v1`, and stores PocketBase data in the
`asoc-pocketbase-v1-data` Podman volume. If `runner/.env` does not contain `ASOC_RUNNER_PASSWORD`, the helper
generates one and saves it without printing the credential. Existing AI provider settings and API keys in that
file are preserved.

Open:

- Frontend + PocketBase API: `http://127.0.0.1:8090`
- PocketBase admin setup: `http://127.0.0.1:8090/_/`

The PocketBase container serves the Svelte build and keeps mutable state outside the image in the named volume.
Override `HOST_PORT`, `ASOC_INTAKE_PORT`, `IMAGE_NAME`, `CONTAINER_NAME`, `VOLUME_NAME`, `RUNNER_IMAGE_NAME`,
`RUNNER_CONTAINER_NAME`, or `NETWORK_NAME` when running the helper if you need a different local setup.

### Seeded PocketBase data

The image includes `pb_migrations/20260418000100_initial_asoc_seed.js`. On first boot of a fresh
`pb_data` directory, PocketBase creates the baseline v1 collections from `SPECS.md` and imports the included
demo markdown into PocketBase file fields:

- `incidents` and `incident_sections` with `incident_sections.content_md_file`
- one file-backed chat section per analyst/agent conversation, matching root `demo-data/manifest.json`
- `tasks`, `task_lifecycle`, `runner_registrations`, and `task_stream_sessions`
- `agent_profiles` and markdown-backed `templates`
- right-pane `resources` with `resources.body_md_file`
- `old_incidents` with archived case markdown

To reset the local tenant and run the no-active-task seed again:

```bash
./scripts/reset-v01.sh --yes
./scripts/run-v01.sh
```

### Runner quick start

```bash
cd pocketbase-v1/runner
npm install
npm start
```

Environment:

- `POCKETBASE_URL` (default: `http://127.0.0.1:8090`)
- `RUNNER_ID` (optional; UUID auto-generated when omitted)
- `RUNNER_NAME` (default: `runner-local`)
- `RUNNER_POLL_MS` (default: `3000`)
