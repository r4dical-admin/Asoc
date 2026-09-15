# Asoc Technical Reference

This document preserves the repository setup, architecture notes, and original interface specification. For the product purpose, concepts, and analyst workflows, start with the [user-focused README](README.md).

Agentic harness for security operations

## License

This project is source-available under the PolyForm Internal Use License 1.0.0.
Organizations may use and modify it freely for their own internal operations, but may not offer it as a service, resell it, redistribute it, bundle it, or use it for third-party managed services without a separate commercial license.

See `LICENSE.md` for the binding license terms and `LICENSE-CLARIFICATION.md` for a plain-language summary.

## Secrets and API Keys

Never commit real model API keys. Keep keys in local `.env` files or deployment secrets, and only commit `.env.example` files with placeholder values.

For local runner development:

```bash
cp pocketbase-v1/runner/.env.example pocketbase-v1/runner/.env
```

Then edit `pocketbase-v1/runner/.env` locally and add provider-specific values such as `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY`.
`pocketbase-v1/scripts/podman-run.sh` creates this file from the example when it is absent, generates and persists
the initial runner password with mode `0600`, and launches both PocketBase and the first runner.
For Gemini, use:

```bash
AI_PROVIDER=gemini
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-3.6-flash
GEMINI_API_KEY=your-local-key
```

`AI_MODEL` is the runner default model for queued tasks. Task-level overrides belong in task definitions, using `context_refs_json.ai.model`. Playbook-level overrides belong in workflow/template definitions, using top-level `ai_provider` and `ai_model` fields.

The repository ignores `.env`, `.env.*`, private key files, and `secrets/` by default. Do not prefix browser-exposed variables with `VITE_` unless they are safe to publish; anything compiled into the frontend can be viewed by users.

## V1 Build Direction

This repository now includes a locked v1 direction for turning the demo into an actual app:

- **Frontend**: Svelte SPA as the primary client surface.
- **Tenant architecture**: one PocketBase container per tenant (subdomain-routed later).
- **Backend model**: PocketBase all-in-one per tenant (auth, collections, queue semantics, lifecycle, static SPA hosting).
- **Execution model**: one or more Runner/Delegate containers connect to a tenant PocketBase and process queued tasks.
- **Markdown storage**: incident sections, templates/workflows, and resources are stored as PocketBase file fields (not repo-local runtime files).
- **Task streaming**: runners append lifecycle records and stream interaction events via PocketBase realtime/websocket channels.
- **Minimum deployment**: two containers (PocketBase + one runner), with optional runner horizontal scaling and optional S3.

See `pocketbase-v1/README.md` and `pocketbase-v1/SPECS.md` for the active production architecture and contracts.

## Demo SPA (file-backed, static)

This demo is intentionally frontend-only: every UI link points to a real file under `demo-data/`, and the SPA loads file contents directly from a **static local server**.

The demo data and interaction patterns are the reference behavior for v1 UX and workflow shape (incident-first navigation, background tasks, and template-guided agent work), while production persistence and orchestration move to PocketBase per tenant + runner containers.

### Run locally (static server only)

From the repo root, run one of these:

```bash
python3 -m http.server 4173
```

or

```bash
npx serve -l 4173 .
```

Then open:

- `http://localhost:4173/interface-example.html`

### How it works

- The SPA reads `demo-data/manifest.json` to build the left/right navigation.
- Incident links map to files in `demo-data/incidents/<incident-id>/`.
- Background task links map to files in `demo-data/background-tasks/`.
- Resource links map to files in `demo-data/resources/<section>/`.
- Clicking a link fetches the backing file and renders it in the center workspace.
- Navigation groups are collapsible, background tasks have their own tabs, and opened files are tracked as closeable tabs.
- Markdown files can be viewed as raw source or rendered content inside the workspace.

### Demo data layout

- `demo-data/manifest.json`
- `demo-data/incidents/*/*.md`
- `demo-data/background-tasks/*.md`
- `demo-data/resources/*/*`

### Repo Index

- `README.md` - product concept, demo instructions, and structure map for the incident workspace.
- `interface-example.html` - static SPA that renders the incident browser experience from local files.
- `demo-data/incidents/` - per-incident chat, overview, timeline, artifact, and Slack views.
- `demo-data/background-tasks/` - background agent runs with task transcripts, assigned templates, and refresh timestamps.
- `demo-data/resources/workflows/` - response templates that tell agents how to handle an incident once it is promoted.
- `demo-data/resources/intakes/` - inbound transport documentation and rules for choosing a response template.
- `demo-data/resources/data-sources/` - hunt entry points, sample queries, and key fields for telemetry systems.
- `demo-data/resources/knowledge-base/` - attacker-pattern notes, system design, and tool deployment context.
- `demo-data/resources/historic-rcas-sev1s/` - prior major-incident summaries and analysis patterns worth reusing.
- `demo-data/resources/skills/` - reusable analysis modules the background agents can invoke.
- `demo-data/resources/mcps-integrations/` - execution bridges for Slack, Jira, and related systems.

## Incident Console — Product & Architecture Artifact

## 1. Vision

The Incident Console is a terminal-inspired (TUI-style) incident response workspace designed to unify:

* Active incident management
* Automated background processing
* Knowledge & historical context
* Integrations and orchestration
* Live collaboration (Chat / Slack)

The goal is to create a SOC-native operating environment that feels like a hybrid between:

* A code IDE
* A SIEM console
* An incident war-room
* A Git-style knowledge repository

This document describes the conceptual model and intended behavior of the UI.

---

# 2. High-Level Layout

The UI is divided into three vertical panes:

LEFT  → Active operational context CENTER → Workspace (browser-style tabs) RIGHT → Structured knowledge & system surface

All panes are collapsible in hierarchical fashion.

---

# 3. Left Pane — Active Incidents

## 3.1 Active Incidents Section

Each incident:

* Has an ID (e.g., INC-2026-041)
* Has a severity (SEV1 / SEV2 / SEV3)
* Is collapsible
* Contains 5 operational views:

  * Chat
  * Overview
  * Timeline
  * Artifacts
  * Slack

Opening any section creates a browser-style tab in the center panel.

### Design Intention

Incidents behave like projects in an IDE.

Each section represents a different operational lens:

* Chat → Analyst discussion and AI interaction
* Overview → Executive / status summary
* Timeline → Chronological attack chain
* Artifacts → Evidence repository
* Slack → External collaboration bridge

---

## 3.2 Background Tasks (Pinned Bottom)

Represents asynchronous automation processes such as:

* Log correlation
* Memory analysis
* IOC enrichment
* Threat graph building

This section communicates:

"Work is happening even if you are not actively looking at it."

Future Direction:

* Real-time streaming logs
* Task state indicators (queued, running, failed, complete)
* Agent-based task execution

---

# 4. Center Pane — Workspace (Browser-Style Tabs)

The center pane functions like a modern web browser or IDE.

Capabilities:

* Multiple open tabs
* Close individual tabs
* Switch between incident sections and repo files
* Welcome screen for orientation

Tab Types:

1. Incident Section Tabs
2. Repository File Tabs
3. System Views (future: dashboards, graphs)

Design Goal:

Reduce context switching friction. Allow side-by-side mental continuity across investigation surfaces.

Future Enhancements:

* Drag-to-reorder tabs
* Split-pane comparison
* Unsaved state indicators
* Tab grouping per incident

---

# 5. Right Pane — Structured System Surface

The right pane represents the knowledge and control plane of the IR system.

Each directory is collapsible and contains:

* README.md (explanatory document)
* Example operational files

## 5.1 Templates

Response templates. Defines detection-to-response orchestration.

Examples:

* auto-containment.yaml
* lateral-movement.yaml

---

## 5.2 Knowledge Base

Threat patterns, internal research, and detection notes.

Examples:

* oauth-abuse.md
* c2-patterns.md

---

## 5.3 Historic RCAs / SEV1s

Archive of post-incident analyses.

Purpose:

* Pattern recognition
* Executive memory
* Institutional learning

---

## 5.4 Skills

Reusable automation and enrichment modules.

Represents:

* Functions
* Agent capabilities
* Analysis primitives

This becomes critical in an AI-augmented SOC.

---

## 5.5 Data Sources

Connected telemetry systems.

Examples:

* EDR
* SIEM

Future direction:

* Health indicators
* Data ingestion stats

---

## 5.6 MCPs / Integrations

External connectors and system integrations.

Examples:

* Slack bridge
* Jira ticket creation

Represents the execution/control plane.

---

## 5.7 Intakes

New inbound signals awaiting triage.

Sources:

* User reports
* Automated alerts
* External feeds

Future direction:

* AI-assisted triage summaries
* Priority scoring
* Automatic incident draft generation
