# Playbook-generated dashboards

Status: implementation specification; no dashboard implementation is included in this change.

## 1. Objective and agreed product decisions

Build a compact dashboard focused on internal ASOC tickets (the existing `incidents` records). Operators should understand intake, triage, response playbook execution, closure, SLA risk, and work requiring attention.

The dashboard is configured through a playbook. A task agent reviews the permitted data, makes exploratory queries, and produces a persistent A2UI interface with query bindings. After generation, the viewer executes those bindings through the backend to load live data without calling an agent for every refresh.

The same mechanism supports dashboards inside individual incidents. Analysts can describe what they want to monitor and explicitly regenerate an incident dashboard. Regeneration reviews the current permitted ticket data and rebuilds the interface.

Agreed requirements:

- Internal tickets are the primary focus; external ticket synchronization is outside this version.
- Provide a useful default Operations dashboard without requiring a prompt.
- Keep the default dashboard compact and make every permitted detail count actionable.
- Store configuration intent in a versioned dashboard playbook.
- On dashboard load, detect playbook changes and regenerate an outdated interface.
- Support incident-specific intent and a user-triggered Regenerate action.
- Enforce the viewer's permissions on all live queries and drill-downs.
- Explicit visibility exception: users may see the number of incidents they cannot access, grouped only by severity. They may see no further information about those incidents.

The defaults and contracts below resolve implementation details for the first build. They may be adjusted without changing these product requirements.

## 2. Initial user experience

### Operations dashboard

Add a Dashboard workspace view within the existing navigation. Render three main sections, targeting no more than four top-level widgets by default:

1. Workflow: intake, triage, response playbook, and closure; include queue depth and waiting age where supported.
2. SLA: breached and due-soon tickets, plus compliance for the selected period when policy and history are available.
3. Needs attention: a bounded list of overdue tickets, stalled triage, failed response runs, and pending approvals.

Include a compact, visually separate “Restricted incidents” summary containing only total count and severity counts. This is the sole exception for inaccessible records, not a source for other dashboard metrics.

Provide period, severity, and source filters for accessible data. Default period: last seven days. Label snapshot metrics “Now” so they are not mistaken for period totals. More filters are available on demand. Show update time and explicit empty, unavailable, loading, and error states; unknown data must not become zero.

Selecting an accessible metric opens a filtered list with the same query semantics and authorization. Restricted counts have no drill-down, tooltip details, record links, or export of underlying records.

### Configuring a dashboard

Support both editing playbook configuration and an optional conversational entry point, such as “Customize dashboard.” Example requests:

- “Show critical tickets nearing SLA, grouped by owner. Hide intake volume.”
- “Focus on pending approvals and failed response playbooks.”

Save durable intent to the playbook or dashboard-specific override, increment its effective revision, and trigger regeneration. Do not silently edit a shared template when the user is configuring a personal view. Make personal versus shared scope explicit. The generated layout remains stable across data refreshes.

### Incident dashboard

Expose a Dashboard tab on incidents for which a dashboard is configured; offer Create dashboard to authorized analysts on other accessible incidents.

An analyst can describe incident-specific interests, for example affected hosts, outstanding evidence requests, containment progress, or unresolved actions. Provide Regenerate and an optional instruction field. Regenerate without new instructions uses existing intent but reviews current ticket data again. New instructions are persisted as a revision of incident-specific intent.

Creation and regeneration run through the existing task queue and show task progress. Normal data updates refresh query results; they do not continually redesign the interface. Playbook changes trigger regeneration on load, and explicit regeneration works even when the playbook is unchanged.

Generated summaries derived from unstructured evidence must be labeled with their generation time and treated as snapshots. Only query-bound content is live. Never imply that a generated containment assessment updates automatically without a supported structured data source.

## 3. Workflow and metric semantics

Do not implement a misleading linear conversion funnel. Triage outcomes are `create`, `comment`, and `ignore`. Multiple intakes can link to one incident, and an incident can have multiple playbook runs. Show these branches and label the unit of each metric: intakes, unique incidents, or runs.

- Current backlog: records currently waiting or active at each applicable stage, independent of period throughput.
- Intake throughput: intakes received during the selected interval.
- Triage outcomes: decisions made during the interval, with create/comment/ignore breakdown.
- Playbook throughput: response runs completed during the interval, with outcomes. Exclude unrelated chat and dashboard-generation tasks.
- Closures: unique incidents closed during the interval. Successful execution alone does not close a ticket.
- End-to-end conversion, if offered, must track a defined intake cohort and its linked incidents rather than divide unrelated period counts.
- Durations require real transition timestamps. Show median and p90 in drill-downs when supported; identify incomplete records and avoid substituting record update timestamps.

### SLA policy

Implement versioned tenant-configured targets by severity. Never invent contractual targets or backfill historical compliance from incomplete data.

Initial supported clocks:

- Triage: intake `received_at` to recorded triage `decided_at`.
- Closure: incident `opened_at` to an explicit closure event.

First-response SLA is deferred until the product defines a qualifying response event; merely starting an agent does not qualify by default.

Initial policy defaults: continuous elapsed time, no pause for approval or external wait, due soon at 80% of the target, and a new closure cycle upon reopening. Store cycle and policy version so historical results remain explainable. Configure targets before displaying compliance; otherwise show “SLA not configured.” If alternate calendars or pauses are later supported, record explicit events and preserve historical policy semantics.

For completed-cycle compliance, denominator is eligible cycles completed during the period; numerator is those completed within their assigned target. Report active breached/due-soon cycles separately. Severity changes retain the cycle's assigned target in this version, unless an explicit audited SLA reassignment occurs. Display the assigned target in details.

Restricted incidents never contribute SLA values, waiting ages, workflow outcomes, owner breakdowns, trends, or narrative summaries visible to an unauthorized viewer.

## 4. Architecture

Reuse PocketBase collections, versioned `templates`, the runner/task lifecycle, and the Svelte workspace. Do not build an independent scheduling or agent runtime.

Separate three responsibilities:

1. Dashboard playbook: durable purpose, instructions, preferences, scope, allowed widget/query capabilities, and generation policy.
2. Dashboard artifact: validated A2UI document, declarative query bindings, provenance, and generation revision.
3. Dashboard runtime: approved component renderer and authorized backend query executor.

Use a documented, pinned A2UI protocol version supported by the chosen renderer. Validate actual protocol messages and the custom component catalog; do not label an arbitrary proprietary layout JSON format as A2UI. The application-specific artifact envelope and query binding schema are separate from the protocol. Official protocol reference: https://a2ui.org/.

Start with a small catalog: metric, workflow, trend, breakdown, and record list, plus layout, text, and filter primitives. Render using components that fit the existing Svelte application. Catalog actions are limited to approved filters and navigation. No generated JavaScript, SQL, HTML execution, arbitrary network requests, or executable expressions.

“The saved dashboard runs queries directly” means the viewer submits stored query identifiers and validated filter values to an authenticated backend endpoint. It does not mean granting the browser database access or storing credentials in A2UI.

## 5. Generation tools and optional skill

Implement generation as a dashboard playbook executed by the task agent. A reusable dashboard-authoring skill may explain design, metric semantics, and output conventions; it is optional packaging and cannot enforce authorization.

Provide narrowly scoped backend tools (names are proposed):

- `asoc.dashboard_capabilities`: returns available components, metrics, query schemas, and supported incident data sources for the caller.
- `asoc.dashboard_query`: executes a bounded exploratory query under the generation principal and enforced dashboard scope.
- `asoc.dashboard_context`: reads current accessible incident sections, comments, evidence metadata, and relevant task results for an incident dashboard.
- `asoc.dashboard_publish`: submits a candidate artifact for validation and atomic publication; the agent cannot choose its tenant, authorization scope, or active revision.

The generation task captures the requesting user, tenant, dashboard, target revision, incident scope, and policy snapshot. Recheck authorization when tools execute and before publishing. Never use the runner's broad service permissions as the requesting user's data permissions.

For a shared dashboard loaded by a read-only user, the backend may enqueue a predefined stale-artifact maintenance task after checking view access; this grants no ability to change instructions or force arbitrary generation. Explicit configuration and regeneration require dashboard edit permission. Deduplicate and rate-limit automatic maintenance tasks.

Incident evidence is untrusted input. It may influence dashboard content but cannot override tool policy, permission checks, or instructions. Generation must not mutate tickets, execute response actions, or contact external systems.

## 6. Query contract

Queries reference an allowlisted dataset/metric, typed filters, approved groupings, ordering, and bounded limits. Backend code owns the joins, timestamp definitions, authorization predicates, and aggregation semantics.

Illustrative application query binding (not an A2UI protocol message):

```json
{
  "id": "tickets_nearing_sla",
  "metric": "incident_sla_attention",
  "scope": "dashboard",
  "filters": { "severity": { "parameter": "severity" } },
  "order": "deadline_ascending",
  "limit": 10
}
```

Resolve scope and parameters on the server. Reject unsupported fields, joins, arbitrary filter expressions, scope overrides, and queries exceeding limits. Every aggregate and corresponding drill-down uses the same authorized base set. Authorize intake and task records too; an unlinked intake must have an explicit visibility policy rather than becoming globally readable by accident.

When a requested incident-specific concept exists only in narrative evidence, either generate a permission-scoped snapshot or show it as unsupported for live querying. Do not fabricate structured evidence, host inventories, or containment metrics.

## 7. Authorization and restricted-incident exception

### Normal access

Dashboard view access does not grant incident access. Enforce tenant isolation and record/field permissions on artifact retrieval, generation context, every data refresh, exports, navigation, and subscription delivery.

Current inspected migration rules broadly permit authenticated users to read incident collections. Incident-level authorization is therefore a prerequisite, not an assumption. Reuse a later canonical access policy if one exists at implementation time; otherwise introduce one before exposing restricted dashboards. Apply it to direct collection APIs, files, incident sections, comments, related tasks, lifecycle output, generated artifacts, and agent tools. Hiding a UI row is insufficient.

Role defaults: read-only users view permitted dashboards; analysts create/edit their personal dashboards and shared incident dashboards where granted edit rights; administrators manage shared Operations playbooks and tenant SLA policies. Roles alone do not substitute for incident visibility rules.

### Deliberate aggregate disclosure

Expose a dedicated authenticated endpoint returning only:

```json
{
  "total": 7,
  "by_severity": { "SEV1": 1, "SEV2": 2, "SEV3": 4, "SEV4": 0, "unknown": 0 }
}
```

Values above are illustrative. Count current non-deleted incidents in the same tenant that the requesting user cannot access, including open and closed records. This fixed scope is independent of dashboard period/source/owner/status filters. Explain that fixed scope in a generic label. Return zeros when there are none.

Only severity selection may narrow the displayed aggregate; do not accept incident IDs, search strings, custom predicates, arbitrary time ranges, or additional groupings. Prefer returning the fixed buckets and applying severity selection locally. No titles, identifiers, owners, sources, statuses, timestamps, SLA values, excerpts, links, or other fields may be returned. Do not expose historical restricted-count trends in this version.

Do not fetch restricted rows to the browser or model and then redact them. Aggregate on the server using the inverse of the canonical incident visibility predicate, within the tenant boundary. The ordinary query tool cannot use this exception to access restricted evidence. The model can receive the same count/severity aggregate only when needed.

Exact counts, including buckets of one, are explicitly permitted by the requested exception. This intentionally reveals existence and severity, and nothing further. Do not silently suppress small buckets or merge restricted rows into ordinary metrics.

### Generated content and caches

Keep shared layout/query definitions free of evidence-derived text, IDs, hidden metadata, tool outputs, and sensitive static chart data. Checking only live queries does not protect a leaked generated label or summary.

Store evidence-derived snapshot content separately from reusable layout, with server-assigned source dependencies and access constraints. Deliver it only to viewers authorized for all contributing sources; conservatively restrict it to its generation principal if broader safety cannot be established. Use generic labels in reusable artifacts. For personalized layouts derived from sensitive evidence, scope the entire artifact to that principal/access context rather than sharing it implicitly.

Cache query results by tenant, viewer/authorization context, scope, query, parameters, and authorization revision. Invalidate on relevant permission changes and never serve a previous authorized result after access is lost. Clear in-memory restricted content on revocation; authorize subscriptions before sending events. Generation logs and task output must follow the same restrictions as their source evidence.

## 8. Persistence model

Exact collection names may follow repository conventions. Required logical records:

| Record | Required information |
| --- | --- |
| Dashboard definition | ID, tenant context, global/incident scope, incident ID if applicable, owner/sharing policy, playbook ID, versioned overrides, active artifact reference |
| Dashboard artifact | Dashboard ID, immutable artifact version, A2UI document, query bindings, protocol/catalog/query schema versions, effective configuration hash, principal/access scope, task ID, generated time |
| Dashboard snapshot content | Artifact ID, content, source dependencies, generation time, access constraints |
| Generation request | Dashboard ID, requester, target hash, generation sequence/idempotency key, task ID, queued/running/succeeded/failed/superseded status, safe error summary |
| SLA policy and cycles | Versioned severity targets, clock semantics, incident/intake relation, start/end/transition events, assigned target and policy version |

Reuse existing records where suitable; avoid duplicate task lifecycle storage. Use backend-enforced references and scoped uniqueness. A tenant may be implicit in a dedicated PocketBase instance, but the isolation guarantee still applies to service calls and caches.

The effective configuration hash includes playbook content/revision, incident or personal overrides, output schema/catalog versions, and any referenced authoring-skill revision that affects generation. Data changes refresh bindings, not the hash. Permission changes invalidate unsafe artifacts/results independently of playbook freshness.

## 9. Loading, refresh, and regeneration

1. Authorize the dashboard and incident scope, then calculate the desired configuration hash.
2. If a compatible authorized artifact exists, render it and load fresh query results.
3. If missing/stale, enqueue one generation request per dashboard, effective hash, and authorization scope. Show a generating state; a prior artifact may remain visible only if still authorized and schema-compatible.
4. The agent reads current permitted context and query capabilities, explores data, and submits an artifact.
5. Validate protocol, catalog, bindings, content access constraints, and output limits. Recheck access and current configuration revision before publication.
6. Atomically publish only if the task still targets the desired revision and latest requested generation sequence. Discard/supersede late output from older runs.
7. Notify open viewers, which retrieve the authorized artifact and query results.

Explicit Regenerate creates a new generation sequence even when the hash matches, allowing a fresh review of incident data. Coalesce repeated clicks while the same request is running. An intentional later request wins over an earlier in-flight run.

On failure, preserve the last compatible authorized artifact and show a safe error with Retry to users allowed to regenerate. Without a usable artifact, show a failure state. Do not expose raw prompts or tool errors. Viewing a closed page does not cancel a useful generation task.

Default data refresh: on load and every 60 seconds while visible, plus manual Refresh data. Pause polling when hidden. Refresh data never invokes the agent. Check configuration revision again on focus and through an authorized change notification or lightweight revision poll while visible.

## 10. Repository integration notes

Relevant current implementation surfaces:

- `frontend/src/components/WorkspaceShell.svelte`: workspace navigation and incident tabs.
- `frontend/src/components/ControlPanel.svelte`: configuration surfaces to inspect for playbook editing integration.
- `pb_migrations/20260915000100_platform.js`: templates/version fields, intakes, intake decisions, tasks, artifacts, and current broad read rules.
- `pb_migrations/20260418000100_initial_asoc_seed.js`: incident open/close metadata and baseline collections.
- `pb_hooks/platform.js` and `pb_hooks/main.pb.js`: backend routes and lifecycle integration.
- `runner/src/index.js`, `runner/src/policy.js`, and `runner/src/tools.js`: execution, playbook validation, and tool policy.

Inspect the current tree before building; these are starting points, not a guarantee that no newer implementation exists. Extend current contracts compatibly. Historical timestamps or ACLs missing from existing data need an explicit migration strategy; do not claim historical SLA accuracy where the evidence is absent.

## 11. Acceptance criteria

### Product and generation

- A seeded Operations playbook produces the compact workflow/SLA/attention dashboard and separate restricted count summary.
- Changing playbook instructions invalidates the artifact and triggers one generation task on the next load; an unchanged playbook reuses it.
- Incident Create/Regenerate reviews current permitted ticket data, follows saved analyst intent, and persists a new interface.
- Refresh data updates bound results without invoking a model; snapshot content retains a visible generation time.
- Concurrent loads are deduplicated. Older tasks cannot overwrite newer revisions or explicit regeneration requests.
- Invalid A2UI, unsupported components, malformed queries, and failed generation never replace the last valid artifact.
- Missing SLA configuration and missing structured incident data render honest unavailable states.

### Correctness

- Fixture coverage includes create/comment/ignore triage, multiple intakes per incident, multiple response runs, failures/retries, and successful runs without ticket closure.
- Current backlog and period throughput are separately labeled and calculated.
- SLA boundary, due-soon threshold, reopening, severity reassignment, incomplete history, and policy revision behavior match the defined contracts.

### Authorization (required integration tests)

- Two users with different incident access see different authorized details from the same shared dashboard.
- An inaccessible incident contributes only to the restricted total and its severity bucket, never ordinary aggregates or snapshots.
- Restricted-count requests cannot add identifying filters, time windows, extra dimensions, or cross-tenant scope.
- Direct collection APIs, protected files, task output, exports, and subscriptions cannot bypass the same incident policy.
- Generated labels, summaries, query literals, and cached artifacts cannot leak evidence to another viewer.
- Editing a playbook cannot elevate access; generation tools remain bound to their principal and incident scope.
- Revoking access during generation blocks unsafe publication; revoking access after generation prevents stale cached content from being served.
- Invalid query/component actions and adversarial instructions embedded in incident evidence cannot execute code or access unauthorized records.

## 12. Suggested implementation order

1. Establish canonical incident/intake/task authorization and the restricted-count endpoint with tests.
2. Implement metric definitions, typed query execution, and SLA configuration/history.
3. Add dashboard records and a fixed renderer using validated A2UI plus a small catalog.
4. Add generation tools and the dashboard playbook to the existing runner, including stale detection and atomic publication.
5. Add the Operations view and incident Create/Regenerate flow.
6. Add conversational configuration using the same versioned playbook contract.

Deliver the default Operations dashboard and incident regeneration in the first complete implementation. Broad custom analytics, external ticket synchronization, arbitrary generated application code, scheduled redesigns, and a large widget marketplace are outside this version.
