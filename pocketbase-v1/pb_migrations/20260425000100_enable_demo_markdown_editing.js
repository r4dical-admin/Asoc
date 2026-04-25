migrate((app) => {
  const editableCollections = ["incident_sections", "resources", "old_incidents", "tasks"];

  for (const name of editableCollections) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      collection.updateRule = "";
      app.save(collection);
    } catch (_) {
    }
  }
}, (app) => {
  const lockedCollections = ["incident_sections", "resources", "old_incidents", "tasks"];

  for (const name of lockedCollections) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      collection.updateRule = null;
      app.save(collection);
    } catch (_) {
    }
  }
});
