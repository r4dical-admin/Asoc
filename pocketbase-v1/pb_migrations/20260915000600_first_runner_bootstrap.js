migrate((app) => {
  const password = $os.getenv('ASOC_RUNNER_PASSWORD');
  if (!password) return;

  try {
    app.findFirstRecordByData('services', 'email', 'runner@asoc.local');
  } catch (_) {
    const service = new Record(app.findCollectionByNameOrId('services'));
    service.load({
      email: 'runner@asoc.local',
      password,
      passwordConfirm: password,
      verified: true,
    });
    app.save(service);
  }
}, () => {
  // Keep the service identity on rollback because runners may still use it.
});
