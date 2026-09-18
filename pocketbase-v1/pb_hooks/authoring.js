const p=require(__hooks+'/platform.js');
const builtins=['asoc.search_incidents','asoc.open_incident','asoc.add_incident_note','asoc.ignore_intake','asoc.triage_decide','asoc.dashboard_capabilities','asoc.dashboard_query','asoc.dashboard_context','asoc.dashboard_publish'];
const categories=['skills','intake-instructions','knowledge-base','workflows','data-sources','historic-rcas-sev1s','settings','intakes','mcps-integrations'];
function clean(value){
  if(typeof value==='string')return value.replace(/Bearer\s+[^\s"',}]+/gi,'Bearer [REDACTED]').replace(/((?:api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]').replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{20,})\b/g,'[REDACTED]');
  if(Array.isArray(value))return value.map(clean);
  if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value))out[key]=/password|authorization|api.?key|credential|secret|token/i.test(key)&&!/_env$/.test(key)?'[REDACTED]':clean(value[key]);return out;}
  return value;
}
function list(app,name){return app.findRecordsByFilter(name,'','',250,0);}
function integration(app,r){
  const c=p.json(r,'config')||{},report=p.optional(app,'integration_discovery','config_id',r.id);
  const safe={};for(const key of ['token_env','secret_env'])if(/^[A-Z_][A-Z0-9_]*$/.test(c[key]||''))safe[key]=c[key];
  for(const key of ['url','base_url','site'])if(typeof c[key]==='string')safe[key]=c[key].split(/[?#]/)[0].replace(/(https?:\/\/)[^/]*@/,'$1');
  for(const key of ['repositories','projects','cron','timezone','input','resource_ids'])if(c[key]!==undefined)safe[key]=clean(c[key]);
  return {id:r.id,name:clean(r.getString('name')),kind:r.getString('kind'),enabled:r.getBool('enabled'),playbook_id:r.getString('playbook_id'),created:r.getString('catalog_created_at'),updated:r.getString('catalog_updated_at'),created_by:r.getString('created_by'),config:safe,status:!r.getBool('enabled')?'disabled':r.getString('kind')!=='mcp'?'enabled':report&&Date.now()-Date.parse(report.getString('checked_at'))<120000?report.getString('status'):'not checked',checked_at:report?.getString('checked_at')||'',tools:report?p.json(report,'tools')||[]:[]};
}
function context(app){
  const connections=list(app,'intake_configs').filter(r=>r.getString('kind')!=='manual').map(r=>integration(app,r));
  return clean({schema:{schema_version:1,roles:['triage','analysis','chat','custom'],required_fields:['name','role','instructions','required_context','outputs','mcp_tool_policy','max_runtime_sec'],timeout_seconds:{min:1,max:86400},tool_modes:['deny','allow','require_approval'],resource_categories:categories},
    context_limits:{catalog_rows:250,playbooks:100,playbook_instruction_characters:1200},
    playbooks:list(app,'templates').slice(0,100).map(r=>{const d=p.json(r,'definition');return {id:r.id,external_id:r.getString('external_id'),name:r.getString('name'),version:r.getInt('version'),definition:{...d,instructions:String(d.instructions||'').slice(0,1200)}};}),
    resources:list(app,'resources').map(r=>({id:r.id,external_id:r.getString('external_id'),title:r.getString('title'),category:r.getString('category'),updated:r.getString('catalog_updated_at')})),
    profiles:list(app,'agent_profiles').map(r=>({id:r.getString('external_id'),name:r.getString('name'),role:r.getString('role_type'),enabled:r.getBool('enabled'),provider:r.getString('model_provider'),model:r.getString('model_name'),tools:p.json(r,'tool_allowlist_json')||[]})),
    model_defaults:p.json(p.find(app,'settings','key','model_defaults'),'value'),
    runner_models:list(app,'runner_registrations').map(r=>{const c=p.json(r,'capabilities_json')||{};return {name:r.getString('display_name'),provider:c.ai_provider,model:c.ai_model,mode:c.launch_mode};}),
    connections,available_tools:[...builtins,...connections.flatMap(c=>c.status==='available'?(c.tools||[]).map(t=>t.name):[])],
    intake_routes:list(app,'intake_configs').filter(r=>r.getString('kind')!=='mcp').map(r=>({name:r.getString('name'),kind:r.getString('kind'),enabled:r.getBool('enabled'),playbook_id:r.getString('playbook_id'),resource_ids:(p.json(r,'config')||{}).resource_ids||[]}))});
}
function revision(r,kind){return kind==='playbook'?String(r.getInt('version')):kind==='overview'?r.getString('content_md_file'):r.getString('body_md_file')+'|'+r.getString('catalog_updated_at');}
function validate(app,kind,draft){
  if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new BadRequestError('A draft object is required.');
  if(kind==='overview'){if(typeof draft.markdown!=='string'||!draft.markdown.trim()||draft.markdown.length>100000)throw new BadRequestError('Overview must contain 1–100,000 characters.');return;}
  if(typeof draft.title!=='string'||!draft.title.trim()||draft.title.length>180)throw new BadRequestError('Enter a title of up to 180 characters.');
  if(kind==='playbook'){
    const d=draft.definition;p.validateDefinition(d);
    const allowed=['schema_version','name','role','instructions','required_context','outputs','mcp_tool_policy','max_runtime_sec','ai_provider','ai_model'];
    if(Object.keys(d).some(k=>!allowed.includes(k)))throw new BadRequestError('Unsupported playbook field.');
    if(typeof d.instructions!=='string'||d.instructions.length>100000)throw new BadRequestError('Instructions must be text of up to 100,000 characters.');
    const ctx=context(app),enabled=Object.keys(d.mcp_tool_policy).filter(k=>d.mcp_tool_policy[k]!=='deny');
    if(Object.keys(d.mcp_tool_policy).some(k=>!ctx.available_tools.includes(k)))throw new BadRequestError('The policy references an unknown or undiscovered tool.');
    if(!ctx.profiles.some(profile=>profile.enabled&&profile.role===d.role&&enabled.every(tool=>profile.tools.includes(tool))))throw new BadRequestError('No enabled profile of this role permits all selected tools.');
    if([...d.required_context,...d.outputs].some(v=>typeof v!=='string'))throw new BadRequestError('Context and output entries must be strings.');
  }else if(kind==='resource'){
    if(!categories.includes(draft.category)||typeof draft.instructions!=='string'||!draft.instructions.trim()||draft.instructions.length>100000)throw new BadRequestError('Choose a category and enter up to 100,000 characters of Markdown.');
  }else throw new BadRequestError('Unknown authoring kind.');
}
function file(text,name){return $filesystem.fileFromBytes(Array.from(unescape(encodeURIComponent(text))).map(c=>c.charCodeAt(0)),name);}
function proposal(task){
  if(task.getString('status')!=='succeeded')return null;
  const text=(p.json(task,'result_summary_json')||{}).markdown||'';
  try{const parsed=JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));if(!parsed.draft)throw new Error();return clean(parsed);}catch{throw new BadRequestError('The agent did not return a valid draft. Ask it to revise the response.');}
}
function owned(app,user,id){const request=app.findRecordById('authoring_requests',id);if(request.getString('owner_id')!==user.id)throw new ForbiddenError();if(request.getString('kind')==='overview')p.incidentForUser(app,user,(p.json(request,'context')||{}).incident_id);else p.role({auth:user},['admin']);return request;}
module.exports={clean,list,integration,context,revision,validate,file,proposal,owned};
