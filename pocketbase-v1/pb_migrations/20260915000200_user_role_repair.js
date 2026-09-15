migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("role")) {
    users.fields.add(new TextField({ name: "role", required: true }));
    app.save(users);
  }
  const admin = app.findFirstRecordByData("users", "username", "admin");
  admin.set("role", "admin");
  app.save(admin);
}, (app) => {
  // Keep the role field on rollback because access rules depend on it.
});
