# GitHub PR Output

Use the configured GitHub MCP connection to publish a playbook result back to its source pull request.

The playbook must explicitly name each GitHub MCP tool and set it to `allow`, `require_approval`, or `deny`. Prefer `require_approval` for PR comments and checks until the tenant intentionally enables unattended output. Before calling a tool, verify the repository and PR number against the intake payload. Include the reviewed head SHA so output cannot be mistaken for a later revision.

Keep one stable marker or check name per playbook so later runs can update the existing result. Never copy credentials into task context, playbook content, or output.
