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
      type: "base",
      name,
      listRule: options.listRule ?? publicRule,
      viewRule: options.viewRule ?? publicRule,
      createRule: options.createRule ?? null,
      updateRule: options.updateRule ?? null,
      deleteRule: options.deleteRule ?? null,
      fields,
      indexes: options.indexes || [],
    });

    app.save(collection);
    return collection;
  }

  function textField(name, required = false, max = 0) {
    return { name, type: "text", required, max };
  }

  function dateField(name, required = false) {
    return { name, type: "date", required };
  }

  function fileField(name, required = true) {
    return {
      name,
      type: "file",
      required,
      maxSelect: 1,
      maxSize: 5242880,
      mimeTypes: ["text/plain", "text/markdown", "text/x-markdown"],
    };
  }

  function seedFileRecord(collectionName, data, fileFieldName, filePath, uniqueField = "external_id") {
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

  const chatThreads = [
    ["INC-1001", "maya", "Analyst / Maya", "chat-maya.md"],
    ["INC-1001", "jordan", "Analyst / Jordan", "chat-jordan.md"],
    ["INC-1001", "triage-agent", "Agent / Triage Template Runner", "chat-triage-agent.md"],
    ["INC-1002", "noa", "Analyst / Noa", "chat-noa.md"],
    ["INC-1002", "eli", "Analyst / Eli", "chat-eli.md"],
    ["INC-1002", "memory-analysis-agent", "Agent / Memory Analysis Worker", "chat-memory-agent.md"],
    ["INC-1003", "rina", "Analyst / Rina", "chat-rina.md"],
    ["INC-1003", "tom", "Analyst / Tom", "chat-tom.md"],
    ["INC-1003", "ioc-enricher", "Agent / IOC Enricher", "chat-ioc-agent.md"],
  ];

  for (const [incidentId, owner, label, fileName] of chatThreads) {
    seedFileRecord(
      "incident_sections",
      {
        external_id: `${incidentId}-chat-${owner}`,
        incident_id: incidentId,
        section: `chat-${owner}`,
        title: label,
      },
      "content_md_file",
      `${seedRoot}/incidents/${incidentId}/${fileName}`,
    );
  }

  saveCollection("old_incidents", [
    textField("external_id", true, 64),
    textField("title", true, 240),
    textField("severity", false, 32),
    dateField("closed_at"),
    fileField("body_md_file"),
  ], {
    indexes: ["CREATE UNIQUE INDEX idx_old_incidents_external_id ON old_incidents (external_id)"],
  });

  const oldIncidents = [
    ["INC-0942", "Business Email Compromise", "SEV1", "2025-09-19 00:00:00.000Z", "inc-0942-bec.md"],
    ["INC-0978", "Identity Federation Outage", "SEV1", "2025-11-02 00:00:00.000Z", "inc-0978-identity-outage.md"],
    ["INC-0884", "Cloud Storage Token Leak", "SEV2", "2025-07-14 00:00:00.000Z", "inc-0884-storage-token-leak.md"],
  ];

  for (const [external_id, title, severity, closed_at, fileName] of oldIncidents) {
    seedFileRecord(
      "old_incidents",
      { external_id, title, severity, closed_at },
      "body_md_file",
      `${seedRoot}/old-incidents/${fileName}`,
    );
  }
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("old_incidents");
    app.delete(collection);
  } catch (_) {
  }

  for (const external_id of [
    "INC-1001-chat-maya",
    "INC-1001-chat-jordan",
    "INC-1001-chat-triage-agent",
    "INC-1002-chat-noa",
    "INC-1002-chat-eli",
    "INC-1002-chat-memory-analysis-agent",
    "INC-1003-chat-rina",
    "INC-1003-chat-tom",
    "INC-1003-chat-ioc-enricher",
  ]) {
    try {
      const record = app.findFirstRecordByData("incident_sections", "external_id", external_id);
      app.delete(record);
    } catch (_) {
    }
  }
});
