migrate((app) => {
  try {
    const settings=app.findFirstRecordByData('settings','key','model_defaults');
    const value=settings.get('value');
    if (value && value.provider === 'gemini' && value.model === 'gemini-2.5-flash') {
      settings.set('value',{provider:'gemini',model:'gemini-3.6-flash'});
      app.save(settings);
    }
  } catch (_) {}
  try {
    const profile=app.findFirstRecordByData('agent_profiles','external_id','profile-chat');
    if (profile.getString('model_provider') === 'gemini' && profile.getString('model_name') === 'gemini-2.5-flash') {
      profile.set('model_name','gemini-3.6-flash');
      app.save(profile);
    }
  } catch (_) {}
}, () => {});
