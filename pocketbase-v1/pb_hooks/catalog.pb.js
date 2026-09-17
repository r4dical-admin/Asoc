// Server-owned attribution; older rows remain unknown rather than inventing history.
onRecordCreateRequest((e)=>{
  const actor=e.auth ? (e.auth.collection().name==='users'?'User: ':'Service: ')+(e.auth.getString('name')||e.auth.getString('username')||e.auth.id)+' ['+e.auth.id+']' : 'System';
  e.record.set('created_by',actor);e.next();
},'resources','templates','intake_configs','intakes','settings','runner_registrations');
onRecordUpdateRequest((e)=>{
  e.record.set('created_by',e.record.original().getString('created_by'));
  e.record.set('catalog_created_at',e.record.original().getString('catalog_created_at'));
  e.next();
},'resources','templates','intake_configs','intakes','settings','runner_registrations');
onRecordCreate((e)=>{
  const now=new Date().toISOString();e.record.set('catalog_created_at',now);e.record.set('catalog_updated_at',now);
  if(!e.record.getString('created_by'))e.record.set('created_by',e.record.getString('created_by_user_id')||'System');
  e.next();
},'resources','templates','intake_configs','intakes','settings','runner_registrations','tasks');
onRecordUpdate((e)=>{
  e.record.set('catalog_updated_at',new Date().toISOString());e.next();
},'resources','templates','intake_configs','intakes','settings','runner_registrations','tasks');
