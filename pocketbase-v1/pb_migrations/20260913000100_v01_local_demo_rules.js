migrate((app) => {
  const writableCollections = [
    "incidents",
    "incident_sections",
    "tasks",
    "task_lifecycle",
    "agent_profiles",
    "templates",
    "resources",
    "old_incidents",
    "runner_registrations",
    "task_stream_sessions",
  ];

  for (const name of writableCollections) {
    const collection = app.findCollectionByNameOrId(name);
    collection.listRule = "";
    collection.viewRule = "";
    collection.createRule = "";
    collection.updateRule = "";
    collection.deleteRule = "";
    app.save(collection);
  }
}, (app) => {
  const writableCollections = [
    "incidents",
    "incident_sections",
    "tasks",
    "task_lifecycle",
    "agent_profiles",
    "templates",
    "resources",
    "old_incidents",
    "runner_registrations",
    "task_stream_sessions",
  ];

  for (const name of writableCollections) {
    const collection = app.findCollectionByNameOrId(name);
    collection.listRule = "";
    collection.viewRule = "";
    collection.createRule = null;
    collection.updateRule = null;
    collection.deleteRule = null;
    app.save(collection);
  }
});
