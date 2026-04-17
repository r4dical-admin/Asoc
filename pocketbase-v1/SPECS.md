# Asoc Specs — PocketBase Per Tenant + Runner/Delegate

## 1) Direction Lock

This spec supersedes prior Supabase-oriented v1 planning for new implementation work.

### Locked decisions

1. **Backend model**: one PocketBase container per tenant.
2. **Routing model**: one tenant subdomain per PocketBase instance (to be finalized in infra).
3. **Frontend model**: SPA is implemented with **Svelte** and served by PocketBase as static assets.
4. **Backend responsibility**: PocketBase is all-in-one (auth, data, queue collections, lifecycle, SPA hosting).
5. **Execution model**: one or more external Runner/Delegate containers consume and execute tasks.
6. **Scaling model**: horizontal runner scaling by attaching more delegate containers to a tenant.
7. **Minimum deployment**: 2 containers per tenant (PocketBase + one runner).
8. **Storage model**: PocketBase-native storage by default; S3 optional.

---

## 2) High-Level Architecture

```text
[User Browser]
   |
   v
[Tenant Subdomain -> PocketBase Container]
   |      |                |
   |      |                +--> serves compiled Svelte SPA assets
   |      +--> collections: incidents, tasks, task_lifecycle, profiles, templates, resources
   | 
   +<---- websocket/realtime events -----> [Runner/Delegate Container(s)]
                                           |
                                           +--> claims queued tasks
                                           +--> executes role logic
                                           +--> writes lifecycle + stdout/stderr + status
```

---

## 3) Containers and Responsibilities

## 3.1 PocketBase Container (Tenant Isolated)

### Required responsibilities

- User auth/session and tenant-scoped API access.
- Host collections and file storage.
- Persist tasks, lifecycle records, and transcript artifacts.
- Publish realtime events for task assignment/lifecycle changes.
- Serve compiled Svelte SPA assets for that tenant.

### Required collections (minimum)

- `users`
- `incidents`
- `incident_sections`
- `tasks`
- `task_lifecycle`
- `agent_profiles`
- `templates`
- `resources`
- `runner_registrations`
- `task_stream_sessions`

### `tasks` collection (minimum fields)

- `id`
- `incident_id`
- `role_type` (`triage|analysis|chat|custom`)
- `status` (`queued|claimed|running|succeeded|failed|canceled`)
- `priority`
- `profile_id`
- `template_id`
- `context_refs_json`
- `claimed_by_runner_id`
- `created_by_user_id`
- `created_at`
- `updated_at`

### `task_lifecycle` collection (minimum fields)

- `id`
- `task_id`
- `runner_id`
- `state`
- `message`
- `stdin_event` (nullable)
- `stdout_event` (nullable)
- `stderr_event` (nullable)
- `sequence_no`
- `created_at`

> Lifecycle records are append-only to preserve auditability.

## 3.2 Runner/Delegate Container

### Required responsibilities

- Register itself with PocketBase (`runner_registrations`).
- Listen for new tasks (polling or realtime subscription).
- Claim exactly one task at a time per worker slot with optimistic locking.
- Load profile/template/context references before execution.
- Execute role logic for any role type (not role-specific binaries).
- Emit lifecycle updates and stream output events to `task_lifecycle`.
- Finalize task status and release claim.

### Required runner metadata

- `runner_id` (stable UUID)
- `display_name`
- `capabilities_json` (models/tools/network)
- `max_parallel_tasks`
- `heartbeat_at`
- `status` (`online|degraded|offline`)

## 3.3 Markdown/File Content Strategy (PocketBase Files Capability)

All markdown-backed content must be stored using PocketBase file fields.

- No runtime dependency on local repo markdown files.
- UI fetches markdown via PocketBase file URLs/API.
- Runner resolves template/resource markdown through PocketBase record + file metadata.

### Typical pattern

- `incident_sections.content_md_file`
- `templates.definition_md_file`
- `resources.body_md_file`

Each file-backed record may also include indexed metadata fields (`title`, `tags`, `type`, `status`) for fast filtering without downloading file contents.

---

## 4) Queue Semantics on PocketBase

No external queue is required for v1.

### Enqueue

- Task creation writes a new `tasks` row with status `queued`.

### Claim

- Runner attempts atomic claim transition:
  - from `queued` to `claimed`
  - set `claimed_by_runner_id`
  - reject if status changed.

### Start

- Runner sets task `running` and opens stream session.

### Finish

- Runner sets one terminal state: `succeeded|failed|canceled`.
- Final artifact pointers (or inline results) are attached.

### Retry

- Retries create a new lifecycle entry and increment retry metadata on task.
- Optional backoff is runner policy-driven.

---

## 5) Interactive Stream Contract (`stdin/stdout`)

When a task enters `running`, runner opens a stream channel bound to `task_stream_sessions`.

## 5.1 Stream events (logical)

- `task.started`
- `task.stdout`
- `task.stderr`
- `task.stdin.request` (if runner requires input)
- `task.stdin.provided` (user message)
- `task.heartbeat`
- `task.completed`
- `task.failed`

Each event is written to `task_lifecycle` with monotonic `sequence_no`.

## 5.2 User interaction model

- UI subscribes to task stream via PocketBase realtime/websocket channel.
- User input is posted to a stream endpoint and persisted as `stdin_event`.
- Runner consumes input and emits resulting output events.

---

## 6) Agent Profiles and Templates

## 6.1 Agent Profiles

`agent_profiles` are tenant-scoped and contain:

- `name`
- `role_type`
- `model_provider`
- `model_name`
- `system_prompt`
- `tool_allowlist_json`
- `max_runtime_sec`
- `result_schema_version`
- `enabled`

## 6.2 Templates/Workflows

Templates are markdown-backed with frontmatter policy and stored in PocketBase file fields.

### Required frontmatter keys (minimum)

```yaml
name: "Mailbox phishing investigation"
id: "TPL-PHISHING-0001"
allowed_profile_roles: [analysis]
tool_allowlist: ["email.search", "siem.query"]
max_runtime_sec: 1800
output_schema_version: "v1"
```

The markdown document above is uploaded and versioned through PocketBase Files (for example, `templates.definition_md_file`), and parsed by the runner at execution time.

### Enforcement

Runner must validate:

1. task role is allowed by template,
2. profile is enabled and role-compatible,
3. requested tools are subset of template + profile allowlists.

---

## 7) Multi-Tenant Isolation

- One tenant == one PocketBase container/data boundary.
- No cross-tenant queries or shared collections.
- Subdomain routing selects tenant PocketBase endpoint.
- Runner credentials are tenant-scoped; runners do not connect to other tenants by default.

---

## 8) Optional S3 Integration

S3 is optional and off by default.

### When enabled

- Large artifacts are stored in S3.
- PocketBase stores only object pointers + checksums.
- Runner uses presigned URLs generated by PocketBase-side API hooks.

### When disabled

- Artifacts remain in PocketBase file storage/collections.

---

## 9) API/Collection Operations (minimum)

### Task creation

- Insert into `tasks` with status `queued`.

### Task list/read

- Filter by incident and status.

### Claim endpoint/operation

- Atomic status transition check.

### Lifecycle append

- Insert append-only rows into `task_lifecycle`.

### Stream subscribe

- Realtime websocket subscription to lifecycle events by `task_id`.

---

## 10) UI Design and Interaction Requirements (derived from demo)

The production SPA (Svelte) should preserve the established demo interaction contract:

1. Left-pane incident tree with collapsible sections (`chat`, `overview`, `timeline`, `artifacts`, `slack`).
2. Background tasks pinned/visible and openable in their own tabs.
3. Center workspace as multi-tab surface for incidents/resources/live task streams.
4. Right-pane resources catalog (`templates/workflows`, knowledge, historic RCAs, skills, integrations).
5. Fast navigation with minimal context switching and persistent tab model.
6. Task tabs must expose live lifecycle stream and interactive stdin controls when available.

The static demo copy in this folder is the baseline UI example for these interactions.

---

## 11) Deployment Profiles

## 11.1 Minimal profile (recommended first build)

- 1x PocketBase container
- 1x Runner/Delegate container

## 11.2 Scaled profile

- 1x PocketBase container
- Nx Runner/Delegate containers
- Optional external metrics/log sink
- Optional S3

---

## 12) Open Items (intentionally deferred)

1. Subdomain provisioning and wildcard TLS automation details.
2. Runner autoscaling policy and queue depth thresholds.
3. Cross-tenant centralized analytics strategy (if needed).
4. S3 enablement thresholds and lifecycle policies.
