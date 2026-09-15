migrate((app) => {
  const publicRule = "";

  function collectionExists(name) {
    try {
      app.findCollectionByNameOrId(name);
      return true;
    } catch (_) {
      return false;
    }
  }

  function saveCollection(name, fields, options = {}) {
    if (collectionExists(name)) return app.findCollectionByNameOrId(name);

    const collection = new Collection({
      type: options.type || "base",
      name,
      listRule: options.listRule ?? publicRule,
      viewRule: options.viewRule ?? publicRule,
      createRule: options.createRule ?? null,
      updateRule: options.updateRule ?? null,
      deleteRule: options.deleteRule ?? null,
      fields,
      indexes: options.indexes || [],
      passwordAuth: options.passwordAuth,
    });

    app.save(collection);
    return collection;
  }

  function fileField(name, required = true) {
    return {
      name,
      type: "file",
      required,
      maxSelect: 1,
      maxSize: 5242880,
      mimeTypes: [
        "text/plain",
        "text/markdown",
        "text/x-markdown",
        "text/yaml",
        "application/yaml",
        "application/x-yaml",
      ],
    };
  }

  function textField(name, required = false, max = 0) {
    return { name, type: "text", required, max };
  }

  function numberField(name, required = false, onlyInt = true) {
    return { name, type: "number", required, onlyInt };
  }

  function boolField(name, required = false) {
    return { name, type: "bool", required };
  }

  function jsonField(name, required = false) {
    return { name, type: "json", required };
  }

  function dateField(name, required = false) {
    return { name, type: "date", required };
  }

  saveCollection("users", [
    textField("name"),
    textField("role"),
  ], {
    type: "auth",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "id = @request.auth.id",
    passwordAuth: { enabled: true },
  });

  saveCollection("incidents", [
    textField("external_id", true, 64),
    textField("title", true, 240),
    textField("severity", false, 32),
    textField("status", false, 64),
    textField("owner", false, 120),
    dateField("opened_at"),
    dateField("closed_at"),
  ], {
    indexes: ["CREATE UNIQUE INDEX idx_incidents_external_id ON incidents (external_id)"],
  });

  saveCollection("incident_sections", [
    textField("external_id", true, 160),
    textField("incident_id", true, 64),
    textField("section", true, 64),
    textField("title", true, 240),
    fileField("content_md_file"),
  ], {
    indexes: [
      "CREATE UNIQUE INDEX idx_incident_sections_lookup ON incident_sections (incident_id, section)",
    ],
  });

  saveCollection("tasks", [
    textField("external_id", true, 64),
    textField("incident_id", true, 64),
    textField("title", true, 240),
    textField("role_type", true, 64),
    textField("status", true, 64),
    numberField("priority"),
    textField("profile_id", false, 64),
    textField("template_id", false, 64),
    jsonField("context_refs_json"),
    textField("claimed_by_runner_id", false, 120),
    textField("created_by_user_id", false, 120),
  ], {
    indexes: [
      "CREATE UNIQUE INDEX idx_tasks_external_id ON tasks (external_id)",
      "CREATE INDEX idx_tasks_status ON tasks (status)",
      "CREATE INDEX idx_tasks_incident ON tasks (incident_id)",
    ],
  });

  saveCollection("task_lifecycle", [
    textField("external_id", true, 160),
    textField("task_id", true, 64),
    textField("runner_id", false, 120),
    textField("state", true, 64),
    textField("message"),
    textField("stdin_event"),
    textField("stdout_event"),
    textField("stderr_event"),
    numberField("sequence_no"),
  ], {
    indexes: ["CREATE INDEX idx_task_lifecycle_task_seq ON task_lifecycle (task_id, sequence_no)"],
  });

  saveCollection("agent_profiles", [
    textField("external_id", true, 64),
    textField("name", true, 160),
    textField("role_type", true, 64),
    textField("model_provider", true, 80),
    textField("model_name", true, 120),
    textField("system_prompt"),
    jsonField("tool_allowlist_json"),
    numberField("max_runtime_sec"),
    textField("result_schema_version", false, 64),
    boolField("enabled"),
  ], {
    indexes: ["CREATE UNIQUE INDEX idx_agent_profiles_external_id ON agent_profiles (external_id)"],
  });

  saveCollection("templates", [
    textField("external_id", true, 64),
    textField("name", true, 180),
    textField("role_type", false, 64),
    jsonField("allowed_profile_roles"),
    jsonField("tool_allowlist"),
    numberField("max_runtime_sec"),
    textField("output_schema_version", false, 64),
    fileField("definition_md_file"),
  ], {
    indexes: ["CREATE UNIQUE INDEX idx_templates_external_id ON templates (external_id)"],
  });

  saveCollection("resources", [
    textField("external_id", true, 160),
    textField("title", true, 240),
    textField("category", true, 120),
    textField("type", false, 80),
    textField("status", false, 64),
    jsonField("tags"),
    fileField("body_md_file"),
  ], {
    indexes: [
      "CREATE UNIQUE INDEX idx_resources_external_id ON resources (external_id)",
      "CREATE INDEX idx_resources_category_title ON resources (category, title)",
    ],
  });

  saveCollection("runner_registrations", [
    textField("external_id", true, 160),
    textField("runner_id", true, 120),
    textField("display_name", true, 160),
    jsonField("capabilities_json"),
    numberField("max_parallel_tasks"),
    dateField("heartbeat_at"),
    textField("status", true, 64),
  ], {
    indexes: ["CREATE UNIQUE INDEX idx_runner_registrations_runner_id ON runner_registrations (runner_id)"],
  });

  saveCollection("task_stream_sessions", [
    textField("task_id", true, 64),
    textField("runner_id", false, 120),
    textField("status", true, 64),
    dateField("opened_at"),
    dateField("closed_at"),
    jsonField("metadata_json"),
  ], {
    indexes: ["CREATE INDEX idx_task_stream_sessions_task ON task_stream_sessions (task_id)"],
  });

  function createRecord(collectionName, data, uniqueField = "external_id") {
    if (data[uniqueField]) {
      try {
        return app.findFirstRecordByData(collectionName, uniqueField, data[uniqueField]);
      } catch (_) {
      }
    }

    const collection = app.findCollectionByNameOrId(collectionName);
    const record = new Record(collection);
    record.load(data);
    app.save(record);
    return record;
  }

  function seedFileRecord(collectionName, data, fileFieldName, filePath, fileName, uniqueField = "external_id") {
    if (data[uniqueField]) {
      try {
        return app.findFirstRecordByData(collectionName, uniqueField, data[uniqueField]);
      } catch (_) {
      }
    }

    const collection = app.findCollectionByNameOrId(collectionName);
    const record = new Record(collection);
    record.load(data);
    record.set(fileFieldName, $filesystem.fileFromPath(filePath));
    app.save(record);
    return record;
  }

  const seedRoot = "/pb/seed-data";

  const incidents = [
    ["INC-1001", "Credential Stuffing Attack", "SEV2", "active", "maya"],
    ["INC-1002", "Suspicious OAuth Token Abuse", "SEV1", "active", "noa"],
    ["INC-1003", "AI Agent Crawling Anomaly", "SEV3", "active", "rina"],
  ];
  const incidentSectionMap = {
    "INC-1001": ["overview", "timeline", "artifacts", "slack", "periodic-update", "status-call", "chat"],
    "INC-1002": ["overview", "timeline", "artifacts", "slack", "periodic-update", "status-call", "chat"],
    "INC-1003": ["overview", "timeline", "artifacts", "slack", "status-call", "chat"],
  };

  for (const [external_id, title, severity, status, owner] of incidents) {
    createRecord("incidents", {
      external_id,
      title,
      severity,
      status,
      owner,
      opened_at: "2026-04-17 09:00:00.000Z",
    });

    for (const section of incidentSectionMap[external_id]) {
      seedFileRecord(
        "incident_sections",
        {
          external_id: `${external_id}-${section}`,
          incident_id: external_id,
          section,
          title: `${external_id} ${section}`,
        },
        "content_md_file",
        `${seedRoot}/incidents/${external_id}/${section}.md`,
        `${external_id}-${section}.md`,
      );
    }
  }

  const profiles = [
    ["profile-triage", "Triage Template Runner", "triage", ["siem.query", "edr.lookup", "identity.search"]],
    ["profile-analysis", "Memory Analysis Worker", "analysis", ["identity.search", "audit.query", "knowledge.read"]],
    ["profile-ioc", "IOC Enricher", "analysis", ["threatintel.lookup", "http.fetch", "siem.query"]],
  ];

  for (const [external_id, name, role_type, tool_allowlist_json] of profiles) {
    createRecord("agent_profiles", {
      external_id,
      name,
      role_type,
      model_provider: "openai",
      model_name: "gpt-5.4-mini",
      system_prompt: `${name} assists incident responders and writes concise, auditable updates.`,
      tool_allowlist_json,
      max_runtime_sec: 1800,
      result_schema_version: "v1",
      enabled: true,
    });
  }

  const resources = [
    ["workflows", "README.md", "Workflow Catalog", "readme"],
    ["workflows", "auto-containment.yaml", "Auto Containment Workflow", "workflow"],
    ["workflows", "incident-overview.md", "Incident Overview Workflow", "workflow"],
    ["workflows", "lateral-movement.yaml", "Lateral Movement Workflow", "workflow"],
    ["workflows", "periodic-updates.md", "Periodic Updates Workflow", "workflow"],
    ["knowledge-base", "README.md", "Knowledge Base", "readme"],
    ["knowledge-base", "c2-patterns.md", "C2 Patterns", "knowledge"],
    ["knowledge-base", "oauth-abuse.md", "OAuth Abuse", "knowledge"],
    ["knowledge-base", "system-design.md", "System Design", "knowledge"],
    ["knowledge-base", "tooling-deployments.md", "Tooling Deployments", "knowledge"],
    ["historic-rcas-sev1s", "README.md", "Historic SEV1 RCA Catalog", "readme"],
    ["historic-rcas-sev1s", "sev1-email-bec.md", "SEV1 Email BEC RCA", "rca"],
    ["historic-rcas-sev1s", "sev1-identity-outage.md", "SEV1 Identity Outage RCA", "rca"],
    ["skills", "README.md", "Skills Catalog", "readme"],
    ["skills", "credential-risk-scorer.md", "Credential Risk Scorer", "skill"],
    ["skills", "github-pr-output.md", "GitHub PR Output", "skill"],
    ["skills", "ioc-enricher.md", "IOC Enricher", "skill"],
    ["data-sources", "README.md", "Data Sources", "readme"],
    ["data-sources", "edr.md", "EDR Data Source", "data-source"],
    ["data-sources", "siem.md", "SIEM Data Source", "data-source"],
    ["mcps-integrations", "README.md", "MCP Integrations", "readme"],
    ["mcps-integrations", "jira-ticket-creator.md", "Jira Ticket Creator", "integration"],
    ["mcps-integrations", "slack-bridge.md", "Slack Bridge", "integration"],
    ["settings", "README.md", "Settings Catalog", "readme"],
    ["settings", "agent-runtime.md", "Agent Runtime Settings", "settings"],
    ["settings", "server-settings.md", "Server Settings", "settings"],
    ["settings", "users.md", "User Settings", "settings"],
    ["intakes", "README.md", "Intake Catalog", "readme"],
    ["intakes", "automated-alert-queue.md", "Automated Alert Queue", "intake"],
    ["intakes", "cron-tasks.md", "Cron Tasks", "intake"],
    ["intakes", "user-report-queue.md", "User Report Queue", "intake"],
  ];

  for (const [category, fileName, title, type] of resources) {
    seedFileRecord(
      "resources",
      {
        external_id: `${category}/${fileName}`,
        title,
        category,
        type,
        status: "active",
        tags: [category, type],
      },
      "body_md_file",
      `${seedRoot}/resources/${category}/${fileName}`,
      fileName,
    );
  }

  const templates = [
    ["TPL-AUTO-CONTAINMENT", "Auto Containment", "analysis", "workflows/auto-containment.yaml"],
    ["TPL-LATERAL-MOVEMENT", "Lateral Movement", "analysis", "workflows/lateral-movement.yaml"],
  ];

  for (const [external_id, name, role_type, resourcePath] of templates) {
    seedFileRecord(
      "templates",
      {
        external_id,
        name,
        role_type,
        allowed_profile_roles: ["analysis", "triage"],
        tool_allowlist: ["siem.query", "edr.lookup", "identity.search", "threatintel.lookup"],
        max_runtime_sec: 1800,
        output_schema_version: "v1",
      },
      "definition_md_file",
      `${seedRoot}/resources/${resourcePath}`,
      resourcePath.split("/").pop(),
    );
  }

  const tasks = [
    ["TASK-204", "Credential Stuffing Triage Agent", "INC-1001", "triage", "queued", 10, "profile-triage", "TPL-AUTO-CONTAINMENT", "credential-stuffing-triage.md"],
    ["TASK-311", "OAuth Memory Analysis Worker", "INC-1002", "analysis", "running", 8, "profile-analysis", "TPL-LATERAL-MOVEMENT", "oauth-memory-analysis.md"],
    ["TASK-427", "API Abuse IOC Enricher", "INC-1003", "analysis", "succeeded", 5, "profile-ioc", "TPL-LATERAL-MOVEMENT", "api-abuse-enrichment.md"],
  ];
  const taskAiOverrides = {
    "TASK-204": { provider: "gemini", model: "gemini-3.6-flash" },
  };

  let sequence = 1;
  for (const [external_id, title, incident_id, role_type, status, priority, profile_id, template_id, taskFile] of tasks) {
    createRecord("tasks", {
      external_id,
      title,
      incident_id,
      role_type,
      status,
      priority,
      profile_id,
      template_id,
      context_refs_json: {
        markdown_file: `background-tasks/${taskFile}`,
        incident_id,
        ...(taskAiOverrides[external_id] ? { ai: taskAiOverrides[external_id] } : {}),
      },
      created_by_user_id: "seed",
    });

    createRecord("task_lifecycle", {
      external_id: `${external_id}-created`,
      task_id: external_id,
      runner_id: status === "queued" ? "" : "runner-seed",
      state: status === "queued" ? "queued" : "stdout",
      message: status === "queued" ? "Task queued from seed data" : "Loaded demo task context",
      stdout_event: status === "queued" ? "" : "Loaded demo task context",
      sequence_no: sequence++,
    });
  }

  createRecord("runner_registrations", {
    external_id: "runner-seed",
    runner_id: "runner-seed",
    display_name: "Seed Runner",
    capabilities_json: {
      roles: ["triage", "analysis", "chat", "custom"],
      stream: true,
      markdown_source: "pocketbase_files",
    },
    max_parallel_tasks: 1,
    heartbeat_at: "2026-04-17 09:15:00.000Z",
    status: "offline",
  }, "runner_id");
}, (app) => {
  for (const name of [
    "task_stream_sessions",
    "runner_registrations",
    "resources",
    "templates",
    "agent_profiles",
    "task_lifecycle",
    "tasks",
    "incident_sections",
    "incidents",
    "users",
  ]) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      app.delete(collection);
    } catch (_) {
    }
  }
});
