import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export const builtinTools=[
  {name:'asoc.search_incidents',description:'Find incidents, comments, prior triage decisions and response playbooks to assess duplicates.',inputSchema:{type:'object',properties:{query:{type:'string'}}}},
  {name:'asoc.open_incident',description:'Open an ASOC incident for this intake and immediately launch the selected response playbook. This finalizes the triage decision.',inputSchema:{type:'object',properties:{title:{type:'string'},severity:{type:'string',enum:['SEV1','SEV2','SEV3','SEV4']},playbook_id:{type:'string'},rationale:{type:'string'}},required:['title','playbook_id','rationale']}},
  {name:'asoc.add_incident_note',description:'Add a note from this intake to an existing ASOC incident. This finalizes the intake as correlated with that incident.',inputSchema:{type:'object',properties:{incident_id:{type:'string'},note:{type:'string'},rationale:{type:'string'}},required:['incident_id','note','rationale']}},
  {name:'asoc.ignore_intake',description:'Ignore this intake with an evidence-based rationale and record the final triage decision.',inputSchema:{type:'object',properties:{rationale:{type:'string'}},required:['rationale']}},
  {name:'asoc.triage_decide',description:'Record intake triage: comment on an existing incident; create a new incident and launch its playbook; or ignore with rationale.',inputSchema:{type:'object',properties:{outcome:{type:'string',enum:['comment','create','ignore']},rationale:{type:'string'},incident_id:{type:'string'},comment:{type:'string'},title:{type:'string'},severity:{type:'string'},playbook_id:{type:'string'}},required:['outcome','rationale']}},
  {name:'asoc.dashboard_capabilities',description:'Return the exact A2UI protocol, component catalog, metrics, and limits supported by ASOC dashboards.',inputSchema:{type:'object',properties:{}}},
  {name:'asoc.dashboard_query',description:'Preview one authorized dashboard metric before designing the interface.',inputSchema:{type:'object',properties:{metric:{type:'string',enum:['operations_flow','sla_summary','attention_tickets','restricted_incidents','incident_summary','incident_tasks','incident_activity']},limit:{type:'number'},filters:{type:'object'}},required:['metric']}},
  {name:'asoc.dashboard_context',description:'Return bounded authorized context for the current dashboard scope.',inputSchema:{type:'object',properties:{}}},
  {name:'asoc.dashboard_publish',description:'Validate and atomically publish a complete A2UI v0.9 dashboard artifact. This must be called exactly once.',inputSchema:{type:'object',properties:{a2ui_messages:{type:'array',items:{type:'object'}},query_bindings:{type:'array',items:{type:'object'}}},required:['a2ui_messages','query_bindings']}}
];
export async function connectTools(configs,env=process.env){
  const tools=[...builtinTools];const clients=new Map();
  for(const c of configs){
    if(c.kind!=='mcp'||!c.enabled)continue;
    const cfg=c.config;const client=new Client({name:'asoc-runner',version:'1.0.0'});
    const token=cfg.token_env?env[cfg.token_env]:null;
    if(cfg.token_env&&!token)throw new Error('Missing MCP environment secret '+cfg.token_env);
    await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url),{requestInit:{headers:token?{Authorization:'Bearer '+token}:{}}}));
    clients.set(c.id,client);
    const list=await client.listTools();for(const t of list.tools){tools.push({...t,name:c.id+'.'+t.name,connection_id:c.id,remote_name:t.name});}
  }
  return {tools,clients};
}
export function modelTools(tools,policy,profile){
  const names={};const definitions=[];
  for(const t of tools)if(profile.includes(t.name)&&['allow','require_approval'].includes(policy[t.name])){const name='tool_'+definitions.length;names[name]=t.name;definitions.push({type:'function',function:{name,description:t.description,parameters:t.inputSchema}});}
  return {definitions,names};
}
