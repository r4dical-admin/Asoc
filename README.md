# Asoc

Asoc is an experimental, agentic operations workspace originally built for security operations. It brings incidents, incoming signals, investigation context, response playbooks, and autonomous background work into one place so a team can move from detection to a documented decision without losing context between tools. The same model can support application security operations, including vulnerability triage, pull-request review, remediation tracking, and coordinated response across engineering systems.

Asoc is built around AI agents as operational workers. People define intent, context, permissions, and approval boundaries; agents perform durable tasks, use reusable skills, invoke connected tools, and leave an auditable record of what they did. Analysts remain in control of consequential actions.

> **Experimental software:** Asoc has not been fully tested or validated for production use. It is provided as is, without warranties. Operators and users are fully responsible for evaluating it, securing it, configuring its permissions, reviewing agent actions, and accepting the results and consequences of its use. To the fullest extent permitted by law, the project authors and contributors accept no liability. The binding terms are in [LICENSE.md](LICENSE.md).

![Asoc incident workspace](docs/images/asoc-incident-workspace.png)

## Agentic by design

Asoc treats operational procedures as material an agent can understand and execute, rather than hard-coding every workflow into application logic:

- **Playbooks are Markdown.** A playbook describes the objective, instructions, required context, expected outputs, model settings, time limits, and tool policy in a format people can read, review, version, and improve.
- **Triage is a playbook.** Each intake is assigned Markdown guidance that tells an agent how to investigate possible duplicates, correlate evidence, and choose whether to update an existing incident, open a new incident with a response playbook, or ignore the signal with a recorded reason.
- **Tasks are work for AI agents.** A task packages the playbook, context, model choice, permissions, lifecycle state, transcript, and artifacts into a durable unit that a runner can claim and execute. Agents should use focused, reusable skills whenever a skill captures the required method or domain knowledge.
- **Skills encode reusable expertise.** Investigation techniques, review methods, reporting formats, and other repeatable capabilities can be maintained independently and composed into many tasks instead of being rewritten into every prompt.
- **Integrations use MCP.** External systems expose their capabilities as MCP tools. A playbook selects the tools an agent can see and marks each one as denied, allowed, or subject to human approval. Inbound webhooks and schedules remain intake transports; actions against systems such as Jira, GitHub, or collaboration platforms go through MCP.
- **Context is assembled for each job.** Incidents, notes, timelines, prior decisions, knowledge, and selected resources are attached to the task so the agent works from explicit evidence rather than relying on hidden conversational state.
- **Autonomy has boundaries.** Agent profiles place an upper limit on capabilities, playbooks narrow that limit for a specific job, and exact tool arguments can pause for analyst or administrator approval.
- **Work is durable and auditable.** Tasks survive browser sessions and runner interruptions. The workspace retains lifecycle events, model output, tool requests, approvals, results, artifacts, and final decisions.
- **Triage combines judgment with idempotency.** Transport-level deduplication prevents repeated deliveries, while the triage agent uses playbook-defined evidence to decide whether separate signals belong to the same incident. Final triage actions are recorded and protected from repeated side effects.
- **Models and runners are replaceable.** Runners claim work independently, and the execution contract supports Gemini, OpenAI-compatible providers, and Ollama without binding playbooks to one model vendor.

This structure makes Asoc a control plane for agent work: intakes create tasks, playbooks supply intent, skills supply methods, context supplies evidence, MCP supplies capabilities, and policies define the limits.

## What Asoc helps you do

- Review active incidents and their chat, overview, timeline, evidence, and collaboration history.
- Receive reports, alerts, GitHub pull requests, Jira issues, and scheduled hunts through configurable intake channels.
- Triage new signals against existing incidents before creating duplicate work.
- Run investigation and response playbooks as durable background tasks.
- Follow model output as it streams and retain the transcript, evidence, decisions, and generated artifacts.
- Control every MCP tool at the playbook level with `deny`, `allow`, or `require approval`.
- Keep reusable knowledge, data-source guides, past incident reviews, skills, and integrations close to the investigation.

## The core concepts

### Incidents

An incident is the shared operational record for a security event. It contains several views of the same investigation: discussion, current assessment, timeline, artifacts, and external collaboration. Opening these views as tabs lets an analyst compare evidence without leaving the incident.

### Intakes

An intake is an incoming item that may require action. It can come from an analyst, an alert webhook, a schedule, a GitHub pull request, or a Jira issue. Each intake keeps its source identity and revision so delivery retries do not create repeated work.

### Triage playbooks

Every intake is assigned a triage playbook. The playbook tells the triage agent what evidence to inspect, how to look for related incidents, and which tools it may use. Triage ends with one recorded decision:

1. Add the new evidence to an existing incident.
2. Create an incident, select a response playbook, and start it.
3. Ignore the intake and retain the reason.

This separates transport deduplication from the judgment of whether two signals describe the same incident.

![Intake review and triage](docs/images/asoc-intake-triage.png)

### Tasks and runners

A task is a durable unit of agent work. It records the selected playbook, model, state, transcript, tool requests, and artifacts. Independent runners claim queued tasks, stream progress back to the workspace, and recover work safely after interruption.

### Playbooks and tools

Playbooks are stored as Markdown and define the job, required context, expected outputs, model settings, timeout, and available MCP tools. Each tool receives one of three policies:

| Policy | Behavior |
| --- | --- |
| `deny` | The agent cannot see or invoke the tool. This is also the default for unspecified tools. |
| `allow` | The agent may invoke the tool during the task. |
| `require approval` | The exact tool call and arguments pause for an admin or analyst to review. Approval applies only to the current task or session. |

![Task activity and approvals](docs/images/asoc-task-activity.png)

### Resources

Resources provide the operational memory around an incident: response playbooks, knowledge articles, historic RCAs, skills, data-source notes, and MCP integration definitions. Analysts can open them beside live incident material and agent output. Agents receive only the resources selected for their task context.

## Typical workflows

### Triage a new signal

```mermaid
flowchart LR
    A[Signal arrives] --> B[Intake recorded]
    B --> C[Triage playbook runs]
    C --> D[Search related incidents]
    D --> E{Decision}
    E -->|Related| F[Comment on incident]
    E -->|New event| G[Create incident and start playbook]
    E -->|No action| H[Ignore and log rationale]
```

The intake delivery is idempotent, while the triage agent makes the incident-level correlation decision from evidence defined by its playbook.

### Investigate an active incident

1. Open the incident from the left navigation.
2. Review its overview and timeline alongside relevant evidence.
3. Ask questions in the incident chat or start a specific analysis playbook.
4. Follow the background task as the runner streams progress.
5. Review any requested MCP action and approve or deny it for that task.
6. Use the stored transcript, tool results, and artifacts to update the incident.

### Review a pull request or Jira issue

Selected GitHub repositories and Jira Cloud projects can feed their changes into an intake playbook. The same triage path checks for related incidents, records its decision, and starts follow-up work when needed. Output actions such as creating or updating Jira records are declared by the playbook and constrained by its allowed MCP tools.

## Workspace tour

The application uses three connected areas:

- **Left:** active incidents and background tasks.
- **Center:** a tabbed workspace for incident views, resources, conversations, and task output.
- **Right:** playbooks, knowledge, previous incident reviews, skills, data sources, integrations, and intakes.

The Control Center provides task creation and filtering, intake review, approval requests, runtime health, model defaults, integrations, playbooks, and user administration. Roles are `admin`, `analyst`, and `read-only`.

## Current status

The current v0.1 implementation includes the PocketBase-backed workspace, durable tasks and chat, real Gemini execution, OpenAI-compatible and Ollama adapters, intake deduplication, GitHub and Jira intake handlers, and playbook-level MCP approval enforcement.

Some integrations still require deployment credentials and end-to-end acceptance. The current checklist is maintained in [TODO.md](TODO.md).

This is an early experimental build, not a finished or fully tested security product. Do not assume that an agent decision, model response, integration action, access-control setting, or generated artifact is correct or safe without independent review appropriate to your environment.

## Try it locally

The application starts with an invite-only local account. The initial login is `admin` / `password` and requires an immediate password change.

For installation, runner configuration, containers, secrets, migrations, and development commands, see the [technical reference](TECHNICAL.md) and the [PocketBase implementation guide](pocketbase-v1/README.md).

The earlier static workspace concept remains available at `interface-example.html` and can be served directly for a read-only product tour.

## Documentation

- [Technical reference](TECHNICAL.md) — repository layout, local setup, secrets, architecture, and the original interface specification.
- [PocketBase implementation guide](pocketbase-v1/README.md) — the active application stack and operational commands.
- [System specification](pocketbase-v1/SPECS.md) — backend collections, contracts, roles, and runtime behavior.
- [Deployment guide](pocketbase-v1/DEPLOYMENT.md) — container and tenant deployment notes.
- [Roadmap and release acceptance](TODO.md) — implementation status and remaining end-to-end checks.
- [Minor todo](TODO-MINOR.md) — small UX and presentation improvements.

## License, responsibility, and contributions

Asoc is free for internal use under the PolyForm Internal Use License 1.0.0. Organizations may use and modify it for their own internal operations. Offering it to third parties, redistributing it, or using it as part of a managed service requires separate permission under the license. See [LICENSE.md](LICENSE.md) for the binding terms and [LICENSE-CLARIFICATION.md](LICENSE-CLARIFICATION.md) for a plain-language summary.

Asoc is provided as is and without warranty. Operators and users assume full responsibility for deployment, security, access, data handling, agent permissions, approvals, outputs, and any action taken through or based on the software. The authors and contributors accept no liability to the fullest extent permitted by law.

Thoughts, issue reports, design feedback, documentation improvements, and code contributions are welcome. The project is still exploring how agentic workflows should fit real security and application security operations, and practical experience can help shape that direction.
