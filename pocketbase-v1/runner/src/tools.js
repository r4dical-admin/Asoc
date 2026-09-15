import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export const builtinTools=[
  {name:'asoc.search_incidents',description:'Find incidents, comments, prior triage decisions and response playbooks to assess duplicates.',inputSchema:{type:'object',properties:{query:{type:'string'}}}},
  {name:'asoc.triage_decide',description:'Record intake triage: comment on an existing incident; create a new incident and launch its playbook; or ignore with rationale.',inputSchema:{type:'object',properties:{outcome:{type:'string',enum:['comment','create','ignore']},rationale:{type:'string'},incident_id:{type:'string'},comment:{type:'string'},title:{type:'string'},severity:{type:'string'},playbook_id:{type:'string'}},required:['outcome','rationale']}}
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
