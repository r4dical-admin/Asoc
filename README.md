# Asoc
Agentic harness for security operations


# Incident Console — Product & Architecture Artifact

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
* Mail gateway

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

* One-click promote to incident
* AI triage scoring
* Deduplication logic

---

# 6. Interaction Model

1. Intakes generate or feed incidents.
2. Incidents open investigation surfaces.
3. Background tasks enrich evidence.
4. Workflows orchestrate response.
5. Skills perform atomic analysis operations.
6. Integrations communicate externally.
7. Historic RCAs reinforce learning.

This forms a closed-loop IR lifecycle.

---

# 7. Architectural Intent

This UI is designed to support:

* Agentic AI analysts
* Human-AI collaborative investigation
* Ephemeral background workers
* Containerized execution
* Event-driven automation

Backend candidates:

* Cloudflare container workers
* Discord or Slack bot-based collaboration
* Event-driven queue + worker model

---

# 8. Product Positioning

This is not a SIEM. This is not just a ticketing system.

It is an Incident Operating System.

It combines:

* Operational context
* Knowledge management
* Automation
* Collaboration
* AI execution surface

---

# 9. Next Evolution Ideas

* Severity-based color coding
* Real-time streaming logs
* Graph-based attack visualization
* Slide-based executive summaries (image-rendered slides generated from markdown definitions, with multiple selectable slide templates and layouts)
* Voice readout + sync call integration (AI agent joins conference calls, delivers incident briefings, and listens for task directives using markdown-driven scripts and templates)
* Cross-incident pattern detection
* Prompt-salted AI analysis modules

---

# 10. Voice Readout & Sync Call System

## 10.1 Concept

The system supports synchronous incident briefings via live conference calls.

An AI agent can:

* Join a call (Zoom / Meet / Slack / Discord)
* Deliver a structured verbal briefing
* Summarize the last 24 hours of activity
* Highlight key risks and actions
* Listen for follow-up instructions

This acts as an "AI Incident Commander Assistant".

---

## 10.2 Markdown-Driven Briefing Templates

All readouts are generated from markdown templates.

Example structure:

```md
# Incident Briefing Template

## Incident Overview
- ID: {{incident_id}}
- Severity: {{severity}}
- Status: {{status}}

## Last 24 Hours
{{timeline_summary}}

## Key Risks
{{risk_summary}}

## Actions Taken
{{actions_taken}}

## Recommended Next Steps
{{next_steps}}
```

The markdown is:

* Parsed into structured sections
* Converted into speech via TTS
* Optionally rendered into slides in parallel

---

## 10.3 Live Call Behavior

During a call, the agent:

1. Delivers initial briefing
2. Waits for human input
3. Detects intents such as:

   * "assign task"
   * "summarize again"
   * "drill into timeline"
4. Triggers workflows or creates tasks

---

## 10.4 Integration Points

* Slack Huddles
* Discord Voice
* Zoom / Google Meet

This connects directly to:

* Workflows (execution)
* Skills (analysis)
* Artifacts (context)

---

## 10.5 Design Intent

This feature enables:

* Executive-friendly incident updates
* Hands-free situational awareness
* Real-time command interface for AI agents

It bridges:

"Dashboard → Conversation → Action"

---

# 11. Summary

The Incident Console represents a unified IR workspace where:

* Incidents are projects
* Tabs are investigation surfaces
* The right pane is institutional memory
* The left pane is live operations
* The bottom pane is automation
* The voice layer enables synchronous human-AI collaboration

It is designed for high-tempo cyber incident response with AI-native workflows.

This document can serve as:

* A product requirements foundation
* A system architecture discussion draft
* A pitch artifact
* A roadmap anchor

---

End of Artifact

---

# 10. Summary

The Incident Console represents a unified IR workspace where:

* Incidents are projects
* Tabs are investigation surfaces
* The right pane is institutional memory
* The left pane is live operations
* The bottom pane is automation

It is designed for high-tempo cyber incident response with AI-native workflows.

This document can serve as:

* A product requirements foundation
* A system architecture discussion draft
* A pitch artifact
* A roadmap anchor

---

End of Artifact
