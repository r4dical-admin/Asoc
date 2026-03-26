# Asoc
Agentic harness for security operations

## Demo SPA (file-backed)

This repository now includes a demo single-page app that loads every displayed link from real local files served by a local HTTP server.

### Run locally

```bash
node server.js
```

Then open:

- `http://localhost:4173/`

### How it works

- Left pane lists incident directories from `demo-data/incidents/*` and every file in each directory.
- Right pane lists resource sections from `demo-data/resources/*` and every file in each section.
- Clicking a link fetches the file through `GET /api/file?...` and loads its content in the center workspace.
- The center pane keeps simple SPA tabs for any file the user opens.

### API endpoints

- `GET /api/incidents`
- `GET /api/resources`
- `GET /api/file?scope=incident&section=INC-1001&name=chat.md`
- `GET /api/file?scope=resource&section=workflows&name=README.md`

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

## 5.1 Workflows

Automation playbooks. Defines detection-to-response orchestration.

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
