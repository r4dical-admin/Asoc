# Asoc Platform Specs (Multi-Tenant, S3-Backed, Containerized)

## 1) Scope and Goals

This document defines a high-level design and component specifications for evolving Asoc into a production-capable, multi-tenant platform with:

- strict tenant isolation,
- S3-compatible object storage as the primary persistence backend,
- fully containerized services,
- a dedicated runtime for background agent containers.

Non-goals (for this phase):

- prescribing one cloud vendor,
- implementing detailed UI behavior beyond API/data contracts,
- full infrastructure-as-code templates (covered in later delivery).

---

## 2) Product Context

Asoc currently provides an incident workspace concept with incidents, background tasks, and knowledge resources. The target architecture turns this into a distributed control plane + data plane system supporting many organizations (tenants) safely and concurrently.

---

## 3) Architecture Principles

1. **Tenant-first design**: every request, object key, log line, and policy decision is tenant-scoped.
2. **Stateless services**: API/UI/workers remain stateless; persistent state moves to managed data backends.
3. **Object storage as source-of-truth for case artifacts/content**: incident documents, transcripts, task outputs, and attachments in S3.
4. **Container consolidation first**: prefer running many control-plane capabilities in the same API container/process boundary when isolation/performance allows.
5. **Container-native runtime**: all workloads run as containers with immutable images and explicit resource limits.
6. **Asynchronous by default**: long-running analysis executes via job queue + agent runner.
7. **Auditable operations**: every control action is traceable (who, what, when, tenant, resource).

---

## 4) High-Level System Design

```text
[Web UI]
   |
   v
[Core API Container: Gateway+BFF+Incident+Task+Resource+Scheduler]
   |                         |                         |
   |                         |                         v
   |                         |                   [Queue/Broker] ----> [Agent Runner Controller]
   |                         |                                              |
   |                         |                                              v
   |                         |                                        [Agent Containers]
   |                         |
   v                         v
[AuthN/AuthZ Provider]   [Metadata DB (SQL)]
   |
   v
[Tenant & Policy Context]

[Core API Container + Agent Results] <-------> [S3 Object Store]

Observability sidecar/agent on every service -> logs/metrics/traces backend
```

### Preferred Packaging Model (Minimize Service Sprawl)

- Default to a **Core API Container** that bundles:
  - API Gateway/BFF endpoints,
  - incident/task/resource control-plane logic,
  - presign/object proxy endpoints,
  - scheduler/cron intake triggers.
- Split into separate services only when required by:
  - security isolation boundaries,
  - independent scaling bottlenecks,
  - operational risk (blast radius).
- This reduces deployment complexity and keeps most platform logic in one deployable unit.

---

## 5) Multi-Tenancy Model

### 5.1 Tenant Isolation Strategy

- **Primary model**: shared control-plane services + logical tenant isolation.
- **Isolation key**: `tenant_id` is mandatory across all domain entities.
- **Data partitioning**:
  - SQL tables include `tenant_id` and composite indexes (`tenant_id`, `resource_id`).
  - S3 key prefixes use `tenants/{tenant_id}/...`.
  - Queue topics/attributes include tenant labels for routing and policy.

### 5.2 Identity and Access

- Support enterprise SSO (OIDC/SAML via IdP).
- JWT/session token must include:
  - `tenant_id`,
  - `subject/user_id`,
  - role claims (`analyst`, `manager`, `admin`, `automation`).
- Every service performs authorization checks using tenant + role + resource ownership.

### 5.3 Isolation Guards

- Middleware rejects requests missing `tenant_id` context.
- ORM/query layer enforces tenant filter injection.
- Signed object URL generation validates tenant ownership of key prefix.
- Cross-tenant access attempts are logged as security events.

### 5.4 Optional Hard Isolation Tier (Future)

For high-regulation customers:
- dedicated namespace and compute pool,
- dedicated encryption keys,
- optional dedicated bucket/database schema.

---

## 6) Storage Design (S3 as Backend)

### 6.1 Object Classes

Store the following as objects:

- incident markdown/doc snapshots,
- timeline exports,
- task transcripts/log bundles,
- uploaded artifacts (pcap, json, text, binaries),
- generated reports.

### 6.2 Canonical Key Layout

```text
tenants/{tenant_id}/incidents/{incident_id}/overview/{version}.md
tenants/{tenant_id}/incidents/{incident_id}/timeline/{timestamp}.json
tenants/{tenant_id}/tasks/{task_id}/transcript/{timestamp}.md
tenants/{tenant_id}/tasks/{task_id}/artifacts/{artifact_name}
tenants/{tenant_id}/resources/{category}/{name}
tenants/{tenant_id}/exports/{export_id}.zip
```

### 6.3 Metadata vs Object Content

- **SQL metadata** stores indexes, references, ownership, lifecycle state, checksums.
- **S3 objects** store bulk payloads.
- Entities reference `object_key`, `object_version`, `content_type`, `sha256`.
- Default transfer path is direct client/agent <-> S3 via tenant-scoped presigned URLs issued by Core API.

### 6.4 Data Integrity & Versioning

- Enable bucket versioning.
- Store content hash in SQL and validate on ingestion.
- Use immutable object writes for evidence artifacts.
- Apply retention and legal hold policies where required.

### 6.5 Security Controls

- SSE-KMS encryption at rest.
- TLS in transit.
- Bucket policy denies unencrypted writes.
- Prefix-based IAM for service roles.
- Malware scanning hook (event-driven) for uploaded binaries.

### 6.6 Lifecycle

- Hot data: 0–30 days standard class.
- Warm archive: 31–180 days IA class.
- Cold archive: >180 days archival tier (as policy permits).
- Per-tenant retention overrides configurable.

---

## 7) Component Specs

### 7.0 Consolidated Control-Plane Deployment (Recommended)

- Run the following as modules in the same container image/service by default:
  - API Gateway / BFF,
  - Incident Service,
  - Task Orchestrator,
  - Resource Catalog,
  - Scheduler / Recurring Intake.
- Keep only high-variance/long-running execution paths separate (agent execution workers/jobs).
- Result Ingestion may run in the core container or as a lightweight worker depending on throughput.

## 7.1 Web UI (Container)

**Responsibilities**
- Render incident console experience.
- Fetch tenant-scoped data through API only.
- Support live task state refresh (poll/SSE/websocket).

**Interfaces**
- REST/GraphQL endpoints via BFF.
- Pre-signed upload/download URL flow.

**Requirements**
- No direct credentials for S3.
- Tenant context obtained at login and refreshed with session.
- Display background task states and result links.

## 7.2 API Gateway / BFF (Container)

**Responsibilities**
- Unified entrypoint for UI and external clients.
- Authentication, rate limiting, request validation.
- Propagate correlation IDs and tenant context downstream.
- Where possible, interact with S3 directly via presigned URL generation to avoid unnecessary proxy services.

**Key APIs**
- `POST /incidents`
- `GET /incidents/:id`
- `POST /tasks`
- `GET /tasks/:id`
- `POST /objects/presign-upload`
- `GET /objects/presign-download`

**Requirements**
- Deny unauthenticated/tenantless traffic.
- Structured audit logs for all mutating calls.
- Support two object access patterns:
  - **Preferred**: API issues tenant-scoped presigned URLs and clients/agents transfer directly with S3.
  - **Fallback**: API streaming proxy for constrained clients or policy-enforced inspection paths.

## 7.3 AuthN/AuthZ Service (3rd-Party Provider)

**Responsibilities**
- Integrate with a 3rd-party auth/user-management provider (e.g., Auth0, Okta, Cognito, Clerk).
- Validate external IdP tokens.
- Map external users/groups to tenant memberships and platform roles.
- Issue internal short-lived service tokens when needed.

**Requirements**
- Role-based + resource-aware policies.
- SCIM or provider-native user/group sync for tenant provisioning.
- JIT (just-in-time) user provisioning at first login.
- Externalized MFA/password/reset/session policies (owned by provider).

## 7.4 Incident Service

**Responsibilities**
- Incident lifecycle (create, update, severity, state transitions).
- Incident section manifests and references to S3 content.

**Data Model (minimum)**
- `incident(id, tenant_id, external_ref, title, severity, status, opened_at, updated_at, closed_at)`
- `incident_pointer(id, tenant_id, incident_id, section, latest_object_key, latest_version, updated_at)`

**Minimal-Metadata Rule (Scale Requirement)**
- Because incident volume can become very large, SQL stores only query-critical metadata and object pointers.
- Large/verbose incident content (chat logs, timelines, analysis notes, artifacts, transcripts, status docs) lives in S3 only.
- Avoid high-cardinality text blobs in SQL incident tables.
- Prefer append-only object writes + pointer updates over large SQL row updates.

## 7.5 Task Orchestrator

**Responsibilities**
- Accept background analysis requests.
- Build execution specs and enqueue jobs.
- Track task state machine:
  - `queued -> scheduled -> running -> succeeded|failed|canceled`.

**Requirements**
- Idempotent task submission keys.
- Retry policy with backoff.
- Dead-letter queue handling.

## 7.6 Queue/Broker

**Responsibilities**
- Decouple request path from long-running execution.
- Deliver task payloads to agent runner.

**Requirements**
- At-least-once delivery.
- Per-tenant fair scheduling controls.
- Message TTL and DLQ.

## 7.7 Agent Runner Controller (Container)

**Responsibilities**
- Consume queued tasks.
- Launch isolated agent containers.
- Enforce runtime policy (CPU/mem/timeouts/network).
- Collect exit code + output pointers.

**Requirements**
- Each execution has unique sandbox/work directory.
- Supports image allowlist and signature verification.
- Emits task lifecycle events.

## 7.8 Agent Containers (Ephemeral)

**Responsibilities**
- Run one analysis job each.
- Read scoped inputs and write outputs.

**Execution Contract**
- Input:
  - signed URL(s) / object keys,
  - task config JSON,
  - tenant + incident context,
  - execution deadline.
- Output:
  - stdout/stderr log stream,
  - structured result JSON,
  - produced artifacts uploaded to scoped S3 prefix.

**Security**
- Non-root user.
- Read-only base filesystem when possible.
- Egress restrictions by policy.
- Secrets from runtime secret manager only.

## 7.9 Result Ingestion Service

**Responsibilities**
- Validate agent outputs.
- Register object metadata in SQL.
- Update task and incident views.

**Requirements**
- Reject malformed/untrusted result schema.
- Verify artifact checksum before finalization.

## 7.10 Metadata DB (SQL)

**Responsibilities**
- System of record for relational metadata.
- Tenant-scoped indexes and query patterns.

**Requirements**
- Migration-managed schema.
- Point-in-time recovery backups.
- Row-level security optional enhancement.

## 7.11 Resource Catalog Service

**Responsibilities**
- Manage templates, skills, integrations docs, and references.
- Version resource pointers to S3 objects.

## 7.12 Observability Stack

**Responsibilities**
- Centralized logs, metrics, traces.
- Tenant-aware dashboards and alerting.

**Requirements**
- Log fields include `tenant_id`, `incident_id`, `task_id`, `trace_id`.
- SLOs for API p95 latency and task completion time.

## 7.13 Scheduler / Recurring Intake Service

**Responsibilities**
- Manage tenant-defined cron schedules for recurring triage jobs.
- Trigger intake events for scheduled tasks and enforce per-tenant quotas.
- Support pause/resume/backfill for scheduled definitions.

**Data Model (minimum)**
- `scheduled_intake(id, tenant_id, name, cron_expr, triage_agent, input_config_ref, enabled, updated_at)`
- `scheduled_intake_run(id, tenant_id, scheduled_intake_id, triggered_at, status, incident_id_nullable, task_id_nullable)`

**Requirements**
- Timezone-aware scheduling with deterministic next-run calculation.
- Misfire policy (skip/catch-up/limit) configurable per schedule.
- Idempotency keys per run to avoid duplicate triggers.
- Detailed run outputs persisted in S3 with SQL pointers only.

---

## 8) Agent Runtime Platform (Where Agent Containers Run)

### 8.1 Recommended Orchestrator

Use a **managed container service** that abstracts nodes and cluster operations (e.g., Azure Container Apps Jobs / AWS Fargate-based jobs / Cloud Run jobs). This aligns with the requirement to avoid Kubernetes/node management and manual capacity sizing.

### 8.2 Runtime Pattern

- Controller receives task message.
- Creates managed container job/task execution per analysis run.
- Job uses approved agent image and task-specific env.
- On completion, controller records status and cleans resources.

### 8.3 Scheduling and Capacity

- Use serverless/container-job autoscaling driven by:
  - queue depth,
  - concurrency limits,
  - per-task CPU/memory profile.
- Quotas/guards:
  - per-tenant concurrent jobs,
  - max spend/concurrency budget,
  - priority lanes for critical incident classes.

### 8.4 Security Hardening

- Managed runtime sandbox restrictions + least-privilege container settings.
- Egress control using provider network controls and policy rules.
- Image scanning/admission policy.
- Workload identity for S3/API access (no static long-lived keys).

---

## 9) Containerization Specifications

### 9.1 Images

- One primary **core-platform image** for most control-plane capabilities.
- Separate images only for specialized agent runtimes and optional high-throughput workers.
- Multi-stage builds.
- Minimal runtime base images.
- SBOM generation and image signing in CI.

### 9.2 Runtime Config

- 12-factor env configuration.
- Secrets via secret manager + mounted/injected at runtime.
- Health probes:
  - `/health/live`
  - `/health/ready`

### 9.3 Local Development Compose Profile

Provide a `docker-compose` profile for:
- ui,
- core-platform-api (gateway + incident + tasks + resources + scheduler),
- auth mock,
- local queue,
- local S3-compatible service (e.g., MinIO) for dev/testing,
- local SQL database.

### 9.4 Deployment Strategy

- Blue/green or rolling with readiness gates.
- Zero-downtime for API/BFF.
- Backward-compatible DB migrations before app rollout.

---

## 10) API and Data Contracts (High-Level)

### 10.1 Task Submission

`POST /tasks`

Request:
- `tenant_id` (from token; not body-authoritative)
- `incident_id`
- `task_type`
- `input_refs[]` (object keys/IDs)
- `priority`

Response:
- `task_id`
- `state=queued`
- `submitted_at`

### 10.2 Task Result Schema

```json
{
  "task_id": "string",
  "tenant_id": "string",
  "status": "succeeded|failed",
  "summary": "string",
  "artifacts": [
    {
      "object_key": "string",
      "content_type": "string",
      "sha256": "string"
    }
  ],
  "metrics": {
    "duration_ms": 0
  }
}
```

### 10.3 Incident Document Manifest

Each incident view uses metadata rows that map section -> latest object pointer, enabling UI tab rendering without direct filesystem assumptions.

---

## 11) Operational Flows

### 11.1 Alert-Triggered Intake -> Triage -> Incident + Analysis

1. An external or internal alert is received by the intake pipeline.
2. Intake routing rules identify the tenant and matching intake configuration.
3. The configured triage agent is triggered with normalized alert context.
4. Triage agent classifies the alert and selects the response template from `resources/templates`.
5. Triage service creates (or links to) an incident with minimal SQL metadata and S3-backed context objects.
6. Triage service starts an analysis agent using:
   - selected template ID/version,
   - incident ID + tenant ID,
   - relevant alert artifacts and enrichment context.
7. Analysis agent executes the template workflow and continuously writes progress updates/results to S3; incident pointers are updated for UI visibility.
8. Incident state/severity can be updated by policy and/or analyst confirmation.

### 11.2 Analyst Chat Flow (Interactive Incident Agent)

1. Analyst opens an incident and starts chat.
2. Chat service creates an interactive agent session bound to `tenant_id + incident_id + user_id`.
3. Session bootstrap loads full incident context from:
   - incident pointers and linked S3 objects,
   - related tasks and artifacts,
   - permitted resources/tools for that user role.
4. Agent responses and tool actions stream back to chat UI.
5. Chat transcript is persisted to S3; only pointers/summary metadata are stored in SQL.

### 11.3 Scheduled/Cron Intake Flow

1. Tenant defines scheduled intake jobs (cron expression + triage agent + input source/query).
2. Scheduler triggers jobs on schedule and emits intake events.
3. Scheduled event runs the assigned triage agent.
4. Triage agent either:
   - creates/updates incidents and kicks off analysis tasks, or
   - closes as no-action with an audit record.
5. Every scheduled run stores:
   - run metadata/status in SQL (minimal),
   - detailed logs/results in S3.

### 11.4 Playground Agent Flow

1. User launches playground agent session.
2. Authorization service computes the user’s effective permissions and accessible scope.
3. Playground agent receives a scoped context graph:
   - incidents user can access,
   - resources/templates/knowledge/tools user can access,
   - tenant boundaries and policy constraints.
4. Agent can explore, query, and execute allowed tools; all actions are audited.
5. Session outputs are saved in S3 with tenant/user/session scoping.

### 11.5 Status Slide Generation Flow

1. User or scheduler requests status deck generation.
2. System loads slide template from templates directory (tenant-default or explicitly selected version).
3. Data assembler gathers required metrics/context from SQL metadata + referenced S3 objects.
4. Generation agent produces deck artifacts (e.g., PPTX/PDF/Markdown) and stores them in S3.
5. Incident/org pointers are updated so generated decks are discoverable in UI.

### 11.6 Leadership Dashboard Generation Flow

1. Dashboard generator runs on schedule or on-demand.
2. Dashboard template defines:
   - required metrics,
   - chart/widget layout,
   - rendering schema (e.g., A2UI-style component descriptors).
3. Metrics pipeline computes tenant-scoped KPIs and trend series.
4. Generator materializes dashboard config + cached data payloads to S3/CDN-backed endpoints.
5. Leadership UI reads template-driven components and renders the dashboard consistently across tenants.

---

## 12) Reliability, DR, and Scaling Targets

- API availability target: 99.9% monthly.
- Task durability: no acknowledged task loss.
- RPO target: <= 15 minutes metadata DB; object storage provider replication policy.
- RTO target: <= 4 hours for regional failover (phase target).
- Backpressure behavior:
  - throttle new low-priority tasks,
  - preserve SEV1 incident workflows.

---

## 13) Compliance and Audit Requirements

- Immutable audit log for:
  - auth events,
  - incident state changes,
  - task execution requests,
  - artifact access.
- Tenant-scoped data export and deletion workflows.
- Policy pack for SOC2-oriented controls (access review, least privilege, change tracking).

---

## 14) Delivery Plan (Phased)

### Phase 1: Foundation
- Introduce SQL metadata schema with tenant keys.
- Implement S3 object abstraction + presigned URL endpoints.
- Containerize current UI/API baseline.

### Phase 2: Tasking and Agent Runtime
- Add queue + task orchestrator.
- Implement agent runner controller and ephemeral agent jobs.
- Add result ingestion and task status UI.

### Phase 3: Security and Hardening
- Enforce policy middleware and audit completeness.
- Add runtime security policies and image signing verification.
- Add retention/lifecycle controls and malware scanning path.

### Phase 4: Scale and Enterprise
- Per-tenant quotas and advanced scheduling.
- Optional hard isolation tier.
- DR automation and compliance reporting.

---

## 15) Open Decisions / RFC Items

1. Cloud provider selection and managed service mapping.
2. Queue technology selection (SQS/SNS, Kafka, RabbitMQ, etc.).
3. Auth provider strategy (managed IdP vs self-hosted).
4. Schema strategy for future cross-tenant analytics (separate warehouse).
5. Evidence immutability policy details by incident severity/regulation.
