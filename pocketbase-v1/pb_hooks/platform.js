// Shared functions are loaded inside each isolated PocketBase route VM.
function body(e) { return e.requestInfo().body; }
function now() { return new Date().toISOString(); }
function role(e, allowed) {
  if (!e.auth || e.auth.collection().name !== 'users' || !e.auth.getBool('active') || e.auth.getBool('must_change_password') || !allowed.includes(e.auth.getString('role'))) throw new ForbiddenError('This action is not allowed for your account.');
}
function service(e) { if (!e.auth || e.auth.collection().name !== 'services') throw new ForbiddenError('Runner authentication required.'); }
function make(app, name, data) { const r = new Record(app.findCollectionByNameOrId(name)); r.load(data); app.save(r); return r; }
function find(app,name,field,value) { return app.findFirstRecordByData(name,field,value); }
function optional(app,name,field,value) { try { return find(app,name,field,value); } catch (_) { return null; } }
function json(record, field) {
  const value = record.get(field);
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) return JSON.parse(String.fromCharCode.apply(null, value));
  if (typeof value === 'string') return value ? JSON.parse(value) : null;
  return JSON.parse(JSON.stringify(value || null));
}
function canAccessIncident(app, user, incident) {
  if (!user || user.collection().name !== 'users') return false;
  if (user.getString('role') === 'admin') return true;
  const visibility = incident.getString('visibility');
  if (!visibility || visibility === 'all') return true;
  const allowed = json(incident, 'allowed_user_ids') || [];
  return Array.isArray(allowed) && allowed.includes(user.id);
}
function incidentForUser(app, user, externalId) {
  const incident = find(app,'incidents','external_id',externalId);
  if (!canAccessIncident(app,user,incident)) throw new ForbiddenError('You do not have access to this incident.');
  return incident;
}
function validateDefinition(d) {
  if (!d || Number(d.schema_version) !== 1 || !['triage','analysis','chat','custom'].includes(String(d.role)) || !d.name || !d.instructions) throw new BadRequestError('Playbook requires schema_version: 1, name, role and instructions.');
  if (d.ai_provider && !['gemini','openai','openai-compatible','ollama','mock'].includes(d.ai_provider)) throw new BadRequestError('Unknown AI provider.');
  if (d.ai_provider && d.ai_provider !== 'mock' && !d.ai_model) throw new BadRequestError('An AI model is required with a provider override.');
  if (!Array.isArray(d.required_context) || !Array.isArray(d.outputs) || !d.mcp_tool_policy || typeof d.mcp_tool_policy !== 'object' || Array.isArray(d.mcp_tool_policy)) throw new BadRequestError('Playbook requires required_context, outputs and mcp_tool_policy.');
  for (const key in d.mcp_tool_policy) if (!['deny','allow','require_approval'].includes(d.mcp_tool_policy[key])) throw new BadRequestError('Invalid MCP tool policy: '+key);
  if (!(d.max_runtime_sec > 0 && d.max_runtime_sec <= 86400)) throw new BadRequestError('Playbook timeout must be between 1 and 86400 seconds.');
}
function queue(app, data, owner) {
  const template = find(app,'templates','external_id',data.template_id);
  const d = json(template, 'definition'); validateDefinition(d);
  const context = data.context_refs_json || {};
  for (const key of d.required_context) if (context[key] === undefined && !data[key]) throw new BadRequestError('Missing required context: '+key);
  if (data.role_type && data.role_type !== d.role) throw new BadRequestError('Task role does not match playbook.');
  const profile = find(app,'agent_profiles','external_id',data.profile_id || 'profile-'+d.role);
  if (!profile.getBool('enabled') || profile.getString('role_type') !== d.role) throw new BadRequestError('Profile is disabled or incompatible.');
  const ai = context.ai || {};
  if (Object.keys(ai).some(k => !['provider','model'].includes(k))) throw new BadRequestError('Task AI overrides accept only provider and model.');
  if (ai.provider && !['gemini','openai','openai-compatible','ollama','mock'].includes(ai.provider)) throw new BadRequestError('Unknown AI provider.');
  if (ai.provider && ai.provider !== 'mock' && !ai.model) throw new BadRequestError('Task provider override requires a model.');
  return make(app,'tasks',{external_id:'TASK-'+$security.randomString(16),title:data.title || template.getString('name'),incident_id:data.incident_id || '',template_id:template.getString('external_id'),profile_id:profile.getString('external_id'),role_type:d.role,status:'queued',priority:Number(data.priority)||5,context_refs_json:context,created_by_user_id:owner,max_attempts:Math.min(5,Math.max(1,Number(data.max_attempts)||3)),session_id:data.session_id || '',intake_id:data.intake_id || '',policy_snapshot:{playbook:d,version:template.getInt('version'),profile_tools:json(profile,'tool_allowlist_json') || []}});
}
function receive(app, config, data, actor='System') {
  if (!config.getBool('enabled')) throw new BadRequestError('Intake is disabled.');
  if (!data.delivery_key) throw new BadRequestError('A delivery key is required.');
  const existing=app.findRecordsByFilter('intakes','config_id = {:c} && delivery_key = {:d}','',1,0,{c:config.id,d:data.delivery_key});
  if (existing.length) return existing[0];
  validateIntakeConfig(app,config);
  const intake=make(app,'intakes',{config_id:config.id,created_by:actor,source_key:data.source_key || '',delivery_key:data.delivery_key,revision:data.revision || '',payload:data.payload || {},status:'queued',received_at:now()});
  const task=queue(app,{title:'Triage: '+config.getString('name'),template_id:config.getString('playbook_id'),intake_id:intake.id,context_refs_json:{resource_ids:(json(config,'config')||{}).resource_ids||[],intake:{id:intake.id,source_key:data.source_key,revision:data.revision,payload:data.payload}}},'intake');
  intake.set('task_id',task.id); app.save(intake); return intake;
}
function ownedTask(e,app,id) {
  service(e); const task=app.findRecordById('tasks',id);
  if (task.getString('claimed_by_runner_id') !== e.auth.id || !['claimed','running'].includes(task.getString('status')) || Date.parse(task.getString('lease_expires_at')) < Date.now()) throw new ForbiddenError('Task lease is not owned by this runner.');
  return task;
}
function triage(app, task, action, data) {
  if (!task.getString('intake_id')) throw new BadRequestError('Triage actions require an intake task.');
  const intake=app.findRecordById('intakes',task.getString('intake_id'));
  const previous=optional(app,'intake_decisions','intake_id',intake.id);
  if (previous) return previous;
  if (!data.rationale) throw new BadRequestError('Triage requires an evidence-based rationale.');

  let outcome=action, incidentId='', resultTaskId='';
  if (action==='comment') {
    const incident=find(app,'incidents','external_id',data.incident_id);
    if (!data.note && !data.comment) throw new BadRequestError('An incident note is required.');
    incidentId=incident.getString('external_id');
    make(app,'incident_comments',{incident_id:incidentId,body:data.note||data.comment,intake_id:intake.id,task_id:task.id,created_at:now()});
  } else if (action==='create') {
    if (!data.title || !data.playbook_id) throw new BadRequestError('A new incident requires a title and response playbook.');
    const severity=data.severity||'SEV3';
    if (!['SEV1','SEV2','SEV3','SEV4'].includes(severity)) throw new BadRequestError('Incident severity must be SEV1, SEV2, SEV3, or SEV4.');
    const response=find(app,'templates','external_id',data.playbook_id);
    if (json(response,'definition')?.role==='triage') throw new BadRequestError('Select a response playbook, not triage.');
    incidentId='INC-'+$security.randomString(12);
    make(app,'incidents',{external_id:incidentId,title:data.title,severity,status:'active',opened_at:now()});
    resultTaskId=queue(app,{incident_id:incidentId,template_id:data.playbook_id,title:data.title,context_refs_json:{intake:json(intake,'payload'),triage_rationale:data.rationale}},'triage').id;
  } else if (action!=='ignore') throw new BadRequestError('Unknown triage action.');

  const decision=make(app,'intake_decisions',{intake_id:intake.id,task_id:task.id,playbook_id:task.getString('template_id'),playbook_version:(json(task,'policy_snapshot')||{}).version||1,outcome,rationale:data.rationale,incident_id:incidentId,result_task_id:resultTaskId,decided_at:now()});
  intake.set('status',outcome);app.save(intake);return decision;
}
function validateIntakeConfig(app,config) {
  const playbook=optional(app,'templates','external_id',config.getString('playbook_id'));
  if(!playbook || playbook.getString('role_type')!=='triage' || (json(playbook,'definition')||{}).role!=='triage')throw new BadRequestError('Choose a triage playbook for this intake.');
  const settings=json(config,'config')||{};
  if(Array.isArray(settings)||typeof settings!=='object')throw new BadRequestError('Intake configuration must be an object.');
  const refs=settings.resource_ids||[];
  if(!Array.isArray(refs)||refs.length>50)throw new BadRequestError('Choose at most 50 resources.');
  for(const id of refs)if(typeof id!=='string'||!optional(app,'resources','external_id',id))throw new BadRequestError('Intake resource does not exist.');
}
module.exports={body,now,role,service,make,find,optional,json,canAccessIncident,incidentForUser,validateDefinition,validateIntakeConfig,queue,receive,ownedTask,triage};
