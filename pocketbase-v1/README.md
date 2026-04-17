# Asoc PocketBase + Svelte Architecture (New Direction)

This folder is the new source of truth for the platform direction.
It replaces the prior Supabase-first planning with a **PocketBase-per-tenant model** and a **separate agent runner/delegate container**.

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
- `pocketbase-v1/runner/` — Runner/Delegate prototype that:
  - polls and claims queued tasks,
  - writes lifecycle records,
  - updates terminal task states in PocketBase.

### Frontend quick start

```bash
cd pocketbase-v1/frontend
npm install
npm run dev
```

Environment:

- `VITE_POCKETBASE_URL` (default: `http://127.0.0.1:8090`)

### Single-container Podman quick start

Use this when you want PocketBase and the compiled Svelte frontend without installing PocketBase locally:

```bash
cd /Users/ido/Documents/asoc/Asoc/pocketbase-v1
./scripts/podman-run.sh
```

The helper builds `asoc-pocketbase-v1`, starts `asoc-pocketbase-v1`, and stores PocketBase data in the
`asoc-pocketbase-v1-data` Podman volume.

Open:

- Frontend + PocketBase API: `http://127.0.0.1:8090`
- PocketBase admin setup: `http://127.0.0.1:8090/_/`

Manual equivalent:

```bash
cd /Users/ido/Documents/asoc/Asoc
podman build -t asoc-pocketbase-v1 -f pocketbase-v1/Containerfile .
podman volume create asoc-pocketbase-v1-data
podman run --name asoc-pocketbase-v1 --replace -d -p 8090:8090 \
  -v asoc-pocketbase-v1-data:/pb/pb_data:Z \
  asoc-pocketbase-v1
```

The container serves the Svelte build from PocketBase's public directory and keeps mutable PocketBase state
outside the image in the named volume. Override `HOST_PORT`, `IMAGE_NAME`, `CONTAINER_NAME`, or `VOLUME_NAME`
when running the helper if you need a different local setup.

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

To reset the local demo tenant and run the seed again:

```bash
podman rm -f asoc-pocketbase-v1
podman volume rm asoc-pocketbase-v1-data
cd /Users/ido/Documents/asoc/Asoc/pocketbase-v1
./scripts/podman-run.sh
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
