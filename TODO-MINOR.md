# Minor Todo

Small UX and presentation changes that do not alter the core task, runner, intake, or incident contracts.

## Navigation cleanup

- [ ] Replace the **Tasks** section in the left pane with **Workers**.
- [ ] Remove the duplicate **Workers** section from the right pane.
- [ ] Show each worker once using its real runner or agent-profile name, current state, and aggregate workload instead of generated person names.
- [ ] Remove individual task rows from the left and right navigation. Keep task records, lifecycle history, transcripts, approvals, and artifacts in the backend for execution and audit, and surface relevant work through its worker or incident context.

## Incident experience

- [ ] Add an action to regenerate an incident overview from the incident's current data, including its timeline, notes, evidence, task results, and relevant artifacts. Show the generated draft for review before replacing the existing overview.
- [ ] Fix the severity badges in the left incident list so labels such as `SEV1`–`SEV4` remain fully visible and do not clip at the pane edge or at narrow pane widths.

## Settings organization

- [ ] Move **MCPs / Integrations** out of the Resources catalog and into the Settings area at the top of the right pane. Keep connection configuration, credentials references, availability, and tool discovery with the other administrative settings.

## Assisted authoring

- [ ] Add structured create and edit forms for playbooks and similar configurable resources, while preserving direct Markdown editing for advanced users.
- [ ] Include an authoring chat beside the form so an AI agent can help draft, review, explain, and improve the content without changing the saved version until the user accepts the proposed edits.
- [ ] Give the authoring agent current, non-secret system context: supported schemas and validation rules, existing playbooks and skills, agent profiles, configured model providers, available MCP connections and discovered tools, tool approval policies, intake routes, and relevant resource metadata. Use this context to make concrete suggestions that are compatible with the running ASOC configuration.
- [ ] Clearly show the context used by the authoring agent, validate its proposed configuration before saving, and never expose API keys, credentials, or other secret environment values to the model.
