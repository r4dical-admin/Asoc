routerAdd('GET','/api/asoc/authoring/context',e=>{require(__hooks+'/platform.js').role(e,['admin']);return e.json(200,require(__hooks+'/authoring.js').context($app));},$apis.requireAuth());
routerAdd('POST','/api/asoc/authoring/validate',e=>{const p=require(__hooks+'/platform.js'),a=require(__hooks+'/authoring.js');p.role(e,['admin']);const b=p.body(e);a.validate($app,b.kind,b.draft);return e.json(200,{valid:true});},$apis.requireAuth());
routerAdd('POST','/api/asoc/authoring/save',e=>{
  const p=require(__hooks+'/platform.js'),a=require(__hooks+'/authoring.js');p.role(e,['admin']);const b=p.body(e);if(!['playbook','resource'].includes(b.kind))throw new BadRequestError();let r;
  $app.runInTransaction(app=>{
    a.validate(app,b.kind,b.draft);const name=b.kind==='playbook'?'templates':'resources';
    r=b.target_id?app.findRecordById(name,b.target_id):new Record(app.findCollectionByNameOrId(name));
    if(b.target_id&&a.revision(r,b.kind)!==String(b.base_revision))throw new BadRequestError('This item changed since you opened it. Reload before saving.');
    if(!b.target_id)r.set('created_by','User: '+(e.auth.getString('username')||e.auth.id)+' ['+e.auth.id+']');
    if(b.kind==='playbook'){
      const d=b.draft.definition;d.name=b.draft.title;
      if(b.target_id&&d.role!=='triage'&&app.findRecordsByFilter('intake_configs','playbook_id = {:id}','',1,0,{id:r.getString('external_id')}).length)throw new BadRequestError('This playbook is assigned to an intake and must remain triage.');
      r.set('external_id',r.getString('external_id')||'PB-'+$security.randomString(24));r.set('name',b.draft.title);r.set('role_type',d.role);r.set('allowed_profile_roles',[d.role]);r.set('definition',d);r.set('version',r.getInt('version')+1);r.set('max_runtime_sec',d.max_runtime_sec);r.set('definition_md_file',a.file(d.instructions,'instructions.md'));
    }else{
      r.set('external_id',r.getString('external_id')||b.draft.category+'/'+$security.randomString(24)+'.md');r.set('title',b.draft.title);r.set('category',b.draft.category);r.set('type','markdown');r.set('status','active');r.set('body_md_file',a.file(b.draft.instructions,'instructions.md'));
    }app.save(r);
  });return e.json(200,{record:r,base_revision:a.revision(r,b.kind)});
},$apis.requireAuth());
routerAdd('POST','/api/asoc/authoring/drafts',e=>{
  const p=require(__hooks+'/platform.js'),a=require(__hooks+'/authoring.js');const b=p.body(e);p.role(e,b.kind==='overview'?['admin','analyst']:['admin']);
  if(!['overview','playbook','resource'].includes(b.kind)||typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>12000)throw new BadRequestError('Enter a request of up to 12,000 characters.');
  let response;$app.runInTransaction(app=>{
    let snapshot,base='',incidentId='';
    if(b.kind==='overview'){
      const section=app.findRecordById('incident_sections',b.target_id);if(section.getString('section')!=='overview')throw new BadRequestError('Choose an incident overview.');incidentId=section.getString('incident_id');const incident=p.incidentForUser(app,e.auth,incidentId);base=a.revision(section,'overview');
      snapshot={incident_id:incidentId,title:incident.getString('title'),severity:incident.getString('severity'),sources:['Incident sections including timeline and evidence','Incident notes','Task results','Relevant artifacts'],overview_file:base};
    }else{snapshot=a.context(app);if(b.target_id)base=a.revision(app.findRecordById(b.kind==='playbook'?'templates':'resources',b.target_id),b.kind);}
    const history=(Array.isArray(b.history)?b.history:[]).slice(-8).map(m=>({role:m.role==='assistant'?'assistant':'user',content:a.clean(String(m.content||'').slice(0,15000))}));
    const request=p.make(app,'authoring_requests',{owner_id:e.auth.id,kind:b.kind,target_id:b.target_id||'',base_revision:base,context:snapshot,created_at:p.now()});
    const task=p.queue(app,{template_id:'TPL-AUTHORING',incident_id:incidentId,title:b.kind==='overview'?'Draft overview: '+incidentId:'Authoring: '+b.kind,context_refs_json:{authoring:{request_id:request.id,requester_id:e.auth.id,kind:b.kind,context:snapshot,current_draft:a.clean(b.draft||{}),history,prompt:a.clean(b.prompt)}}},e.auth.id);
    request.set('task_id',task.id);app.save(request);response={id:request.id,task_id:task.id,status:task.getString('status'),context:snapshot};
  });return e.json(200,response);
},$apis.requireAuth());
routerAdd('GET','/api/asoc/authoring/drafts/{id}',e=>{
  const p=require(__hooks+'/platform.js'),a=require(__hooks+'/authoring.js');p.role(e,['admin','analyst']);const r=a.owned($app,e.auth,e.request.pathValue('id')),task=$app.findRecordById('tasks',r.getString('task_id'));let proposal=null,error='';
  try{proposal=a.proposal(task);if(proposal)a.validate($app,r.getString('kind'),proposal.draft);}catch(err){error=String(err.message||err);}
  return e.json(200,{id:r.id,task_id:task.id,status:task.getString('status'),context:p.json(r,'context'),proposal,error:error||(p.json(task,'result_summary_json')||{}).error||'',applied_at:r.getString('applied_at')});
},$apis.requireAuth());
routerAdd('POST','/api/asoc/authoring/drafts/{id}/runner-context',e=>{
  const p=require(__hooks+'/platform.js'),a=require(__hooks+'/authoring.js'),b=p.body(e);const task=p.ownedTask(e,$app,b.task_id),r=$app.findRecordById('authoring_requests',e.request.pathValue('id'));
  if(r.getString('task_id')!==task.id)throw new ForbiddenError();
  const user=$app.findRecordById('users',r.getString('owner_id'));p.role({auth:user},r.getString('kind')==='overview'?['admin','analyst']:['admin']);a.owned($app,user,r.id);
  if(b.context){if(JSON.stringify(b.context).length>500000)throw new BadRequestError('Authoring context is too large.');const context=a.clean(b.context);if(r.getString('kind')==='overview')context.incident_id=task.getString('incident_id');r.set('context',context);$app.save(r);}
  return e.json(200,{ok:true});
},$apis.requireAuth());
routerAdd('POST','/api/asoc/authoring/drafts/{id}/apply',e=>{
  const p=require(__hooks+'/platform.js'),a=require(__hooks+'/authoring.js');p.role(e,['admin','analyst']);let section;
  $app.runInTransaction(app=>{const r=a.owned(app,e.auth,e.request.pathValue('id'));if(r.getString('kind')!=='overview'||r.getString('applied_at'))throw new BadRequestError('This draft cannot be applied.');const proposal=a.proposal(app.findRecordById('tasks',r.getString('task_id')));if(!proposal)throw new BadRequestError('The draft is not ready.');a.validate(app,'overview',proposal.draft);section=app.findRecordById('incident_sections',r.getString('target_id'));p.incidentForUser(app,e.auth,section.getString('incident_id'));if(a.revision(section,'overview')!==r.getString('base_revision'))throw new BadRequestError('The overview changed while this draft was being prepared. Regenerate it before replacing.');section.set('content_md_file',a.file(proposal.draft.markdown,'overview.md'));app.save(section);r.set('applied_at',p.now());app.save(r);});return e.json(200,section);
},$apis.requireAuth());
routerAdd('GET','/api/asoc/integrations',e=>{const p=require(__hooks+'/platform.js'),a=require(__hooks+'/authoring.js');p.role(e,['admin']);return e.json(200,a.list($app,'intake_configs').filter(r=>r.getString('kind')!=='manual').map(r=>a.integration($app,r)));},$apis.requireAuth());
routerAdd('POST','/api/asoc/integrations',e=>{
  const p=require(__hooks+'/platform.js'),a=require(__hooks+'/authoring.js');p.role(e,['admin']);const b=p.body(e),c=b.config||{};
  if(!b.name||!['mcp','github','jira','webhook','cron'].includes(b.kind))throw new BadRequestError('Choose an integration name and kind.');
  const allowed=['url','base_url','site','token_env','secret_env','repositories','projects','cron','timezone','input','resource_ids'];if(Object.keys(c).some(k=>!allowed.includes(k)))throw new BadRequestError('Use only supported configuration fields; credentials must be environment references.');
  const plainConfig=JSON.parse(JSON.stringify(c));if(JSON.stringify(plainConfig)!==JSON.stringify(a.clean(plainConfig)))throw new BadRequestError('Remove secret values from the configuration; use environment references.');
  for(const k of ['repositories','projects','resource_ids'])if(c[k]!==undefined&&(!Array.isArray(c[k])||c[k].some(v=>typeof v!=='string')))throw new BadRequestError(k+' must be a list of strings.');
  if(b.kind==='github'&&(!c.repositories?.length||c.repositories.some(v=>! /^[\w.-]+\/[\w.-]+$/.test(v))))throw new BadRequestError('Enter at least one owner/repository.');
  if(b.kind==='jira'&&(!c.site||!c.projects?.length))throw new BadRequestError('Enter a Jira site and project keys.');
  if(b.kind==='cron'&&(typeof c.cron!=='string'||c.cron.trim().split(/\s+/).length<5))throw new BadRequestError('Enter a cron expression.');
  if(b.enabled&&['github','jira','webhook'].includes(b.kind)&&!c.secret_env)throw new BadRequestError('Set a webhook secret environment reference before enabling.');
  for(const k of ['token_env','secret_env'])if(c[k]&&!/^[A-Z_][A-Z0-9_]*$/.test(c[k]))throw new BadRequestError('Credential references must be environment variable names.');
  for(const k of ['url','base_url','site'])if(c[k]&&!/^https?:\/\/[^/?#@\s]+(?:\/[^?#\s]*)?$/.test(c[k]))throw new BadRequestError('Use an HTTP(S) URL without credentials, query parameters, or fragments.');
  if(b.kind==='mcp'&&!c.url)throw new BadRequestError('An MCP URL is required.');let r;
  $app.runInTransaction(app=>{r=b.id?app.findRecordById('intake_configs',b.id):new Record(app.findCollectionByNameOrId('intake_configs'));if(b.id&&r.getString('kind')==='manual')throw new BadRequestError('Use intake routing for manual reports.');r.load({name:b.name,kind:b.kind,enabled:b.enabled===true,playbook_id:b.playbook_id||'TPL-TRIAGE',config:c});p.validateIntakeConfig(app,r);if(!b.id)r.set('created_by','User: '+e.auth.id);app.save(r);const old=p.optional(app,'integration_discovery','config_id',r.id);if(old)app.delete(old);});return e.json(200,a.integration($app,r));
},$apis.requireAuth());
routerAdd('POST','/api/asoc/integrations/{id}/discovery',e=>{
  const p=require(__hooks+'/platform.js');p.service(e);const id=e.request.pathValue('id'),config=$app.findRecordById('intake_configs',id),b=p.body(e);
  if(config.getString('kind')!=='mcp')throw new BadRequestError();let record;
  $app.runInTransaction(app=>{record=p.optional(app,'integration_discovery','config_id',id)||new Record(app.findCollectionByNameOrId('integration_discovery'));record.load({config_id:id,status:b.status==='available'?'available':'unavailable',tools:(Array.isArray(b.tools)?b.tools:[]).slice(0,250).filter(t=>typeof t.name==='string'&&t.name.startsWith(id+'.')).map(t=>({name:t.name})),checked_at:p.now()});app.save(record);});return e.json(200,{ok:true});
},$apis.requireAuth());
onRecordCreate(e=>{const p=require(__hooks+'/platform.js');const ids=p.json(e.record,'allowed_user_ids')||[];e.record.set('access_user_ids',(Array.isArray(ids)?ids:[]).filter(id=>p.optional(e.app,'users','id',id)));e.next();},'incidents');
onRecordUpdate(e=>{const p=require(__hooks+'/platform.js');const ids=p.json(e.record,'allowed_user_ids')||[];e.record.set('access_user_ids',(Array.isArray(ids)?ids:[]).filter(id=>p.optional(e.app,'users','id',id)));e.next();},'incidents');
