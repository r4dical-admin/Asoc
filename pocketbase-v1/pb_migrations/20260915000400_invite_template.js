migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.resetPasswordTemplate = {subject:"Your ASOC invitation",body:'<p>You have been invited to ASOC.</p><p><a class="btn" href="{APP_URL}/?invite={TOKEN}">Accept invitation</a></p><p>If you did not expect this invitation, ignore this email.</p>'};
  app.save(users);
}, (app) => {});
