routerAdd('POST','/api/asoc/password',(e)=>{
  if (!e.auth || e.auth.collection().name !== 'users') throw new ForbiddenError();
  const b=e.requestInfo().body; if (!b.password || b.password.length<12) throw new BadRequestError('Use at least 12 characters.');
  const r=$app.findRecordById('users',e.auth.id);
  if (!r.validatePassword(b.old_password || '')) throw new BadRequestError('Current password is incorrect.');
  r.setPassword(b.password);r.set('must_change_password',false);$app.save(r);return e.json(200,{ok:true});
},$apis.requireAuth());
routerAdd('POST','/api/asoc/invite',(e)=>{
  const p=require(__hooks+'/platform.js'); p.role(e,['admin']); const b=p.body(e);
  if (!['admin','analyst','read-only'].includes(b.role)) throw new BadRequestError('Invalid role.');
  if (p.optional($app,'users','email',b.email)) throw new BadRequestError('User already exists.');
  const password=$security.randomString(40);
  const r=p.make($app,'users',{email:b.email,password,passwordConfirm:password,role:b.role,active:true,must_change_password:false});
  try { $mails.sendRecordPasswordReset($app,r); } catch(err) { $app.delete(r); throw new BadRequestError('Invitation could not be sent. Configure SMTP and the application URL first.'); }
  return e.json(200,{id:r.id,email:b.email});
},$apis.requireAuth());
routerAdd('POST','/api/asoc/users/{id}',(e)=>{
  const p=require(__hooks+'/platform.js');p.role(e,['admin']);const r=$app.findRecordById('users',e.request.pathValue('id'));const b=p.body(e);
  if (!['admin','analyst','read-only'].includes(b.role)) throw new BadRequestError('Invalid role.');
  if (r.id===e.auth.id && (b.role!=='admin'||b.active===false)) throw new BadRequestError('You cannot remove your own admin access.');
  r.set('role',b.role);r.set('active',b.active!==false);$app.save(r);return e.json(200,r);
},$apis.requireAuth());
// OAuth identities may only attach to an already invited account.
onRecordAuthWithOAuth2Request((e)=>{
  const p=require(__hooks+'/platform.js');const email=e.oauth2User?.email;
  const r=email ? p.optional(e.app,'users','email',email) : null;
  if (!r || !r.getBool('active') || !e.oauth2User.isVerified) throw new ForbiddenError('A verified identity and invitation are required.');
  e.record = r;
  e.next();
},'users');
routerAdd('POST','/api/asoc/tasks',(e)=>{
  const p=require(__hooks+'/platform.js');p.role(e,['admin','analyst']);let result;
  $app.runInTransaction(app=>{let b=p.body(e);if(b.definition_id){const record=app.findRecordById('task_definitions',b.definition_id);b=Object.assign({},p.json(record,'definition'),b);}result=p.queue(app,b,e.auth.id);});return e.json(200,result);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/tasks/{id}/cancel',(e)=>{
  const p=require(__hooks+'/platform.js');p.role(e,['admin','analyst']);let r;
  $app.runInTransaction(app=>{r=app.findRecordById('tasks',e.request.pathValue('id'));if(['queued','claimed','running'].includes(r.getString('status'))){r.set('cancel_requested_at',p.now());if(r.getString('status')==='queued')r.set('status','canceled');app.save(r);}});return e.json(200,r);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/tasks/{id}/claim',(e)=>{
  const p=require(__hooks+'/platform.js');p.service(e);let r;
  $app.runInTransaction(app=>{r=app.findRecordById('tasks',e.request.pathValue('id'));if(r.getString('status')!=='queued'||Date.parse(r.getString('next_eligible_at'))>Date.now())throw new BadRequestError('Task is not claimable.');r.set('status','claimed');r.set('claimed_by_runner_id',e.auth.id);r.set('attempt_no',r.getInt('attempt_no')+1);r.set('lease_expires_at',new Date(Date.now()+60000).toISOString());app.save(r);});return e.json(200,r);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/tasks/{id}/progress',(e)=>{
  const p=require(__hooks+'/platform.js');let r;
  $app.runInTransaction(app=>{r=p.ownedTask(e,app,e.request.pathValue('id'));const b=p.body(e);
    for(const k of ['status','next_eligible_at','finished_at','error_code','result_summary_json','ai_provider','ai_model'])if(b[k]!==undefined)r.set(k,b[k]);
    if(!['claimed','running','queued','succeeded','failed','canceled','timed_out'].includes(r.getString('status')))throw new BadRequestError('Invalid task state.');
    if(['claimed','running'].includes(r.getString('status')))r.set('lease_expires_at',new Date(Date.now()+60000).toISOString());else {r.set('lease_expires_at','');r.set('claimed_by_runner_id','');}
    app.save(r);
  });return e.json(200,r);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/recover',(e)=>{
  const p=require(__hooks+'/platform.js');p.service(e);let count=0;
  $app.runInTransaction(app=>{for(const r of app.findRecordsByFilter('tasks','(status = "claimed" || status = "running") && lease_expires_at < {:now}','',200,0,{now:p.now()})){
    r.set('status',r.getString('cancel_requested_at')?'canceled':r.getInt('attempt_no')<(r.getInt('max_attempts')||3)?'queued':'failed');r.set('claimed_by_runner_id','');r.set('lease_expires_at','');r.set('error_code','lease_expired');app.save(r);
    p.make(app,'task_lifecycle',{external_id:$security.randomString(24),task_id:r.getString('external_id'),state:'abandoned',message:'Expired runner lease recovered',sequence_no:Date.now()*1000});
    for(const s of app.findRecordsByFilter('task_stream_sessions','task_id = {:id} && status = "open"','',0,0,{id:r.getString('external_id')})){s.set('status','closed');s.set('closed_at',p.now());app.save(s);}count++;
  }});return e.json(200,{recovered:count});
},$apis.requireAuth());
routerAdd('POST','/api/asoc/chats',(e)=>{const p=require(__hooks+'/platform.js');p.role(e,['admin','analyst']);const b=p.body(e);return e.json(200,p.make($app,'chat_sessions',{title:b.title||'New conversation',incident_id:b.incident_id||'',owner_id:e.auth.id,created_at:p.now()}));},$apis.requireAuth());
routerAdd('POST','/api/asoc/chats/{id}/messages',(e)=>{
  const p=require(__hooks+'/platform.js');p.role(e,['admin','analyst']);let t;
  $app.runInTransaction(app=>{const s=app.findRecordById('chat_sessions',e.request.pathValue('id'));const text=p.body(e).message;if(!text||typeof text!=='string')throw new BadRequestError('A message is required.');
    if(app.findRecordsByFilter('tasks','session_id = {:id} && (status = "queued" || status = "claimed" || status = "running")','',1,0,{id:s.id}).length)throw new BadRequestError('Wait for the current reply or cancel its task.');
    const history=app.findRecordsByFilter('chat_messages','session_id = {:id}','created_at',0,0,{id:s.id}).map(r=>({role:r.getString('role'),content:r.getString('body')}));history.push({role:'user',content:text});
    t=p.queue(app,{template_id:'TPL-CHAT',session_id:s.id,incident_id:s.getString('incident_id'),title:s.getString('title'),context_refs_json:{messages:history}},e.auth.id);
    p.make(app,'chat_messages',{session_id:s.id,task_id:t.id,role:'user',body:text,created_at:p.now()});
  });return e.json(200,t);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/intakes',(e)=>{
  const p=require(__hooks+'/platform.js');p.role(e,['admin','analyst']);let r;$app.runInTransaction(app=>{const b=p.body(e);const c=app.findRecordById('intake_configs',b.config_id);if(c.getString('kind')!=='manual')throw new BadRequestError('Choose a manual intake.');r=p.receive(app,c,b);});return e.json(200,r);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/intakes/receive',(e)=>{
  const p=require(__hooks+'/platform.js');p.service(e);let r;$app.runInTransaction(app=>{const b=p.body(e);r=p.receive(app,app.findRecordById('intake_configs',b.config_id),b);});return e.json(200,r);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/tools/request',(e)=>{
  const p=require(__hooks+'/platform.js');let call;
  $app.runInTransaction(app=>{const b=p.body(e);const t=p.ownedTask(e,app,b.task_id);const snapshot=p.json(t,'policy_snapshot')||{};const policy=snapshot.playbook?.mcp_tool_policy||{};
    if(!snapshot.profile_tools?.includes(b.tool)||!['allow','require_approval'].includes(policy[b.tool]))throw new ForbiddenError('Tool denied by playbook or profile.');
    const existing=app.findRecordsByFilter('tool_calls','task_id = {:id} && attempt_no = {:a} && call_key = {:k}','',1,0,{id:t.id,a:t.getInt('attempt_no'),k:b.call_key});
    if(existing.length){call=existing[0];if(call.getString('tool')!==b.tool||JSON.stringify(call.get('arguments'))!==JSON.stringify(b.arguments))throw new BadRequestError('Tool call identity reused with different arguments.');return;}
    call=p.make(app,'tool_calls',{task_id:t.id,attempt_no:t.getInt('attempt_no'),call_key:b.call_key,tool:b.tool,arguments:b.arguments||{},status:policy[b.tool]==='allow'?'approved':'pending',created_at:p.now()});
  });return e.json(200,call);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/tools/{id}/approve',(e)=>{
  const p=require(__hooks+'/platform.js');p.role(e,['admin','analyst']);let r;
  $app.runInTransaction(app=>{r=app.findRecordById('tool_calls',e.request.pathValue('id'));const t=app.findRecordById('tasks',r.getString('task_id'));if(r.getString('status')!=='pending'||!['claimed','running'].includes(t.getString('status'))||t.getInt('attempt_no')!==r.getInt('attempt_no'))throw new BadRequestError('This request is no longer pending.');r.set('status',p.body(e).approve===true?'approved':'denied');r.set('approved_by',e.auth.id);r.set('approval_scope',t.getString('session_id')||t.id);app.save(r);});return e.json(200,r);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/tools/{id}/start',(e)=>{
  const p=require(__hooks+'/platform.js');let r;
  $app.runInTransaction(app=>{r=app.findRecordById('tool_calls',e.request.pathValue('id'));const t=p.ownedTask(e,app,r.getString('task_id'));if(t.getInt('attempt_no')!==r.getInt('attempt_no')||r.getString('status')!=='approved')throw new ForbiddenError('Invocation is not approved or was already started.');r.set('status','executing');app.save(r);});return e.json(200,r);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/tools/{id}/finish',(e)=>{
  const p=require(__hooks+'/platform.js');const r=$app.findRecordById('tool_calls',e.request.pathValue('id'));p.ownedTask(e,$app,r.getString('task_id'));if(r.getString('status')!=='executing')throw new BadRequestError('Invocation is not executing.');r.set('status',p.body(e).error?'failed':'completed');r.set('result',p.body(e).result);$app.save(r);return e.json(200,r);
},$apis.requireAuth());
routerAdd('POST','/api/asoc/tools/{id}/builtin',(e)=>{
  const p=require(__hooks+'/platform.js');let result;
  $app.runInTransaction(app=>{const call=app.findRecordById('tool_calls',e.request.pathValue('id'));const t=p.ownedTask(e,app,call.getString('task_id'));if(call.getString('status')!=='executing'||call.getInt('attempt_no')!==t.getInt('attempt_no'))throw new ForbiddenError();const b=call.get('arguments')||{};
    if(call.getString('tool')==='asoc.search_incidents'){
      result={incidents:app.findRecordsByFilter('incidents','title ~ {:q} || external_id = {:q}','',50,0,{q:b.query||''}),decisions:app.findRecordsByFilter('intake_decisions','','-decided_at',50),comments:app.findRecordsByFilter('incident_comments','','-created_at',50),playbooks:app.findRecordsByFilter('templates','','',50)};
    }else if(call.getString('tool')==='asoc.triage_decide'){
      const intake=app.findRecordById('intakes',t.getString('intake_id'));const old=p.optional(app,'intake_decisions','intake_id',intake.id);if(old){result=old;return;}
      if(!['comment','create','ignore'].includes(b.outcome)||!b.rationale)throw new BadRequestError('Triage needs outcome and rationale.');
      let incidentId='',taskId='';
      if(b.outcome==='comment'){const incident=p.find(app,'incidents','external_id',b.incident_id);incidentId=incident.getString('external_id');if(!b.comment)throw new BadRequestError('Comment is required.');p.make(app,'incident_comments',{incident_id:incidentId,body:b.comment,intake_id:intake.id,task_id:t.id,created_at:p.now()});}
      if(b.outcome==='create'){if(!b.title||!b.playbook_id)throw new BadRequestError('New incident requires title and response playbook.');const response=p.find(app,'templates','external_id',b.playbook_id);if(p.json(response,'definition')?.role==='triage')throw new BadRequestError('Select a response playbook, not triage.');incidentId='INC-'+$security.randomString(12);p.make(app,'incidents',{external_id:incidentId,title:b.title,severity:b.severity||'SEV3',status:'active',opened_at:p.now()});taskId=p.queue(app,{incident_id:incidentId,template_id:b.playbook_id,title:b.title,context_refs_json:{intake:p.json(intake,'payload'),triage_rationale:b.rationale}},'triage').id;}
      result=p.make(app,'intake_decisions',{intake_id:intake.id,task_id:t.id,playbook_id:t.getString('template_id'),playbook_version:(p.json(t,'policy_snapshot')||{}).version||1,outcome:b.outcome,rationale:b.rationale,incident_id:incidentId,result_task_id:taskId,decided_at:p.now()});intake.set('status',b.outcome);app.save(intake);
    }else throw new BadRequestError('Unknown builtin tool.');
  });return e.json(200,result);
},$apis.requireAuth());
// Validate configuration through the API, even when clients bypass the settings UI.
onRecordCreateRequest((e)=>{const p=require(__hooks+'/platform.js');p.validateDefinition(p.json(e.record,'definition'));e.next();},'templates');
onRecordUpdateRequest((e)=>{const p=require(__hooks+'/platform.js');p.validateDefinition(p.json(e.record,'definition'));e.record.set('version',e.record.original().getInt('version')+1);e.next();},'templates');
onRecordCreateRequest((e)=>{const p=require(__hooks+'/platform.js');const b=p.json(e.record,'value')||{};if(e.record.getString('key')!=='model_defaults'||Object.keys(b).some(k=>!['provider','model'].includes(k)))throw new BadRequestError('Only non-secret model defaults belong in settings.');e.next();},'settings');
onRecordUpdateRequest((e)=>{const p=require(__hooks+'/platform.js');const b=p.json(e.record,'value')||{};if(e.record.getString('key')!=='model_defaults'||Object.keys(b).some(k=>!['provider','model'].includes(k))||!['gemini','openai','openai-compatible','ollama','mock'].includes(b.provider)||!b.model)throw new BadRequestError('Set a supported provider and model; secrets stay in the environment.');e.next();},'settings');
