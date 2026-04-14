# Welcome to the Incident Console Demo

This landing page explains how the screen is organized and what each area is meant to represent during an incident.

## Left Pane: Active Incidents

The left pane is the live operational queue.

- each incident is a collapsible workspace
- `Chat` expands into individual analyst chats plus the background agent chat tied to the selected template
- `Overview`, `Timeline`, `Artifacts`, and `Slack` open focused tabs in the center workspace

## Bottom of the Left Pane: Background Tasks

The background task section tracks agent runs that are already executing.

- these tasks usually come from a template that was kicked off by an alert, intake, or scheduled cron run
- each task file shows status, assigned template, refresh time, and a short transcript of what the agent has done

## Center Pane: Workspace

The center pane is the investigation surface.

- every file opens as a tab so analysts can move between incidents, chats, tasks, and reference docs
- markdown can be viewed as `Rendered` content or as raw source
- the welcome page lives here when no other tab is active

## Right Pane: Structured System Surface

The right pane is the knowledge and control plane for the incident program.

- `Templates` describe how background agents should respond
- `Knowledge Base` holds system design notes, tool deployment context, and attack-pattern writeups
- `Historic RCAs / SEV1s` capture lessons from prior major incidents
- `Skills`, `Data Sources`, `MCPs / Integrations`, and `Intakes` define what context and actions are available to the analysts and agents

## How to Explore

- expand an incident, then open `Chat` to see analyst and agent-specific conversations
- open a background task to see the template run that produced follow-up work
- browse the right pane to inspect templates, intakes, and the supporting knowledge the agents load
