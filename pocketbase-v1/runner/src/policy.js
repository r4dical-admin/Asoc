import { parseDocument } from 'yaml';
export function parsePlaybook(text) {
  const match=text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const doc=parseDocument(match?match[1]:text,{uniqueKeys:true});
  if(doc.errors.length) throw new Error(`Invalid playbook YAML: ${doc.errors[0].message}`);
  const d=doc.toJS({maxAliasCount:50});
  if(!d || typeof d!=='object'||Array.isArray(d))throw new Error('Playbook must be a YAML mapping.');
  if(match)d.instructions=match[2];
  return validatePlaybook(d);
}
export function validatePlaybook(d) {
  if(d.schema_version!==1||!d.name||!d.instructions||!['analysis','triage','chat','custom'].includes(d.role))throw new Error('Invalid playbook schema, name, instructions or role.');
  if(!Array.isArray(d.required_context)||!Array.isArray(d.outputs)||!d.mcp_tool_policy||Array.isArray(d.mcp_tool_policy))throw new Error('Missing context, outputs or MCP policy.');
  for(const mode of Object.values(d.mcp_tool_policy))if(!['deny','allow','require_approval'].includes(mode))throw new Error('Invalid tool policy.');
  if(!(d.max_runtime_sec>0&&d.max_runtime_sec<=86400))throw new Error('Invalid task timeout.');
  return d;
}
export function resolveAI(task={},playbook={},defaults={},env=process.env) {
  const override=task.context_refs_json?.ai||{};
  const provider=String(override.provider||playbook.ai_provider||defaults.provider||env.AI_PROVIDER||'gemini').toLowerCase();
  if(!['mock','gemini','openai','openai-compatible','ollama'].includes(provider))throw new Error('Unknown AI provider: '+provider);
  const model=override.model||playbook.ai_model||defaults.model||env.AI_MODEL||(provider==='gemini'?'gemini-3.6-flash':'');
  const base_url=provider==='gemini'
    ? env.GEMINI_BASE_URL||'https://generativelanguage.googleapis.com/v1beta/openai'
    : provider==='openai'
      ? env.OPENAI_BASE_URL||'https://api.openai.com/v1'
      : provider==='ollama'
        ? env.OLLAMA_BASE_URL||'http://127.0.0.1:11434/v1'
        : env.AI_BASE_URL;
  const key=provider==='gemini'
    ? env.GEMINI_API_KEY||env.AI_API_KEY
    : provider==='openai'
      ? env.OPENAI_API_KEY||env.AI_API_KEY
      : provider==='openai-compatible'
        ? env.AI_API_KEY||env.OPENAI_API_KEY
        : provider==='ollama'
          ? env.OLLAMA_API_KEY||env.AI_API_KEY||'ollama'
          : '';
  if(provider!=='mock'&&!model)throw new Error('Missing model for '+provider);
  if(!['mock','ollama'].includes(provider)&&!key)throw new Error('Missing API key for '+provider+'; configure runner environment secrets.');
  if(provider!=='mock'&&!base_url)throw new Error('Missing AI_BASE_URL for compatible provider.');
  return {provider,model:model||'mock',base_url,request_timeout_ms:Math.max(1000,Number(env.AI_REQUEST_TIMEOUT_MS||120000))};
}
export function redact(value,env=process.env) {
  let text=typeof value==='string'?value:JSON.stringify(value);
  for(const [key,secret] of Object.entries(env))if(/KEY|TOKEN|SECRET|PASSWORD|AUTH/i.test(key)&&secret&&secret.length>=4)text=text.split(secret).join('[REDACTED]');
  text=text.replace(/(Bearer\s+)[^\s"',}]+/gi,'$1[REDACTED]').replace(/((?:api[_-]?key|authorization|password|secret|token)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,'$1[REDACTED]');
  if(typeof value==='string')return text;
  try{return JSON.parse(text);}catch{return '[REDACTED]';}
}
export function retryState(task,error,now=Date.now()) {
  if(error?.canceled)return {status:'canceled',error_code:'canceled'};
  if(error?.timeout)return {status:'timed_out',error_code:'timeout'};
  if(error?.permanent||task.attempt_no>=(task.max_attempts||3))return {status:'failed',error_code:error?.code||'execution_failed'};
  return {status:'queued',next_eligible_at:new Date(now+Math.min(60000,1000*2**task.attempt_no)).toISOString(),error_code:'retry_scheduled'};
}
