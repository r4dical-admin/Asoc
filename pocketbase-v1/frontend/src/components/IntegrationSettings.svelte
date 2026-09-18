<script lang="ts">
 import {onMount,createEventDispatcher} from 'svelte';
 import {pb,listResources} from '../lib/pocketbase';
 const dispatch=createEventDispatcher<{openResource:{resource:any}}>();
 let references:any[]=[];
 let rows:any[]=[],id='',name='',kind='mcp',enabled=false,url='',tokenEnv='',secretEnv='',repositories='',projects='',site='',cron='',timezone='UTC',input='{}',playbookId='TPL-TRIAGE',resourceIds:string[]=[],playbooks:any[]=[],error='',message='',busy=false;
 async function load(){try{[rows,playbooks]=await Promise.all([pb.send('/api/asoc/integrations',{method:'GET'}),pb.collection('templates').getFullList({filter:'role_type="triage"'})]);}catch(e){error=e instanceof Error?e.message:'Could not load integrations';}}
 function edit(r:any={}){id=r.id||'';name=r.name||'';kind=r.kind||'mcp';enabled=!!r.enabled;const c=r.config||{};url=c.url||'';tokenEnv=c.token_env||'';secretEnv=c.secret_env||'';repositories=(c.repositories||[]).join('\n');projects=(c.projects||[]).join('\n');site=c.site||'';cron=c.cron||'';timezone=c.timezone||'UTC';input=JSON.stringify(c.input||{},null,2);playbookId=r.playbook_id||'TPL-TRIAGE';resourceIds=c.resource_ids||[];error='';message='';}
 async function save(){busy=true;error='';message='';try{
  const config:any={...(resourceIds.length?{resource_ids:resourceIds}:{}),...(tokenEnv?{token_env:tokenEnv}:{}),...(secretEnv?{secret_env:secretEnv}:{})};
  if(kind==='mcp')config.url=url;
  if(kind==='github')config.repositories=repositories.split('\n').map(v=>v.trim()).filter(Boolean);
  if(kind==='jira'){config.site=site;config.projects=projects.split('\n').map(v=>v.trim()).filter(Boolean);}
  if(kind==='cron'){config.cron=cron;config.timezone=timezone;config.input=JSON.parse(input);}
  const result=await pb.send('/api/asoc/integrations',{method:'POST',body:{id,name,kind,enabled,playbook_id:playbookId,config}});id=result.id;message='Saved. Enabled MCP connections are checked periodically by the runner.';await load();
 }catch(e){error=e instanceof Error?e.message:'Could not save integration';}finally{busy=false;}}
 onMount(()=>{void load();void listResources().then(rows=>references=rows.filter(r=>r.category==='mcps-integrations')).catch(()=>{});const timer=setInterval(()=>{if(!document.hidden)void load();},15000);return ()=>clearInterval(timer);});
</script>
<section><h3>MCPs / Integrations</h3><p>Credentials stay in runner environment variables. Enter their variable names here. Discovery lists available tools; playbook and profile permissions still control execution.</p>
 <div class="scroll"><table><thead><tr><th>Name</th><th>Kind</th><th>Availability</th><th>Checked</th><th>Tools</th><th>Created / updated</th><th>Created by</th></tr></thead><tbody>{#each rows as row}<tr><td><button on:click={()=>edit(row)}>{row.name}</button></td><td>{row.kind}</td><td>{row.status}</td><td>{row.checked_at?new Date(row.checked_at).toLocaleString():'—'}</td><td><details><summary>{row.tools.length} discovered</summary>{#each row.tools as tool}<div>{tool.name}</div>{/each}</details></td><td>{row.created?new Date(row.created).toLocaleString():'Not recorded'}<br/>{row.updated?new Date(row.updated).toLocaleString():'Not recorded'}</td><td>{row.created_by||'Not recorded'}</td></tr>{/each}</tbody></table></div>
 <button on:click={()=>edit()}>New integration</button>
 <form on:submit|preventDefault={save}><h4>{id?'Edit integration':'New integration'}</h4><label>Name<input bind:value={name} maxlength="180" required /></label><label>Kind<select bind:value={kind}>{#each ['mcp','github','jira','webhook','cron'] as k}<option>{k}</option>{/each}</select></label>
 <label class="check"><input type="checkbox" bind:checked={enabled}/> Enabled</label>
 {#if kind==='mcp'}<label>MCP HTTP URL<input type="url" bind:value={url} required placeholder="https://example.com/mcp" /></label>{/if}
 {#if ['mcp','github'].includes(kind)}<label>Token environment variable<input bind:value={tokenEnv} pattern="[A-Z_][A-Z0-9_]*" placeholder="SERVICE_API_TOKEN" /></label>{/if}
 {#if ['github','jira','webhook'].includes(kind)}<label>Webhook secret environment variable<input bind:value={secretEnv} pattern="[A-Z_][A-Z0-9_]*" required placeholder="WEBHOOK_SECRET" /></label>{/if}
 {#if kind==='github'}<label>Repositories (owner/repository, one per line)<textarea bind:value={repositories} required ></textarea></label>{/if}
 {#if kind==='jira'}<label>Jira site URL<input type="url" bind:value={site} required /></label><label>Project keys (one per line)<textarea bind:value={projects} required ></textarea></label>{/if}
 {#if kind==='cron'}<label>Cron expression<input bind:value={cron} required /></label><label>Timezone<input bind:value={timezone} required /></label><label>Scheduled input (JSON)<textarea bind:value={input} required ></textarea></label>{/if}
 {#if kind!=='mcp'}<label>Triage playbook<select bind:value={playbookId}>{#each playbooks as p}<option value={p.external_id}>{p.name}</option>{/each}</select></label>{/if}
 <button disabled={busy}>{busy?'Saving…':'Save integration'}</button></form>
 {#if error}<p role="alert">{error}</p>{/if}{#if message}<p role="status">{message}</p>{/if}
 {#if references.length}<details><summary>Integration reference</summary>{#each references as resource}<button on:click={()=>dispatch('openResource',{resource})}>{resource.title}</button>{/each}</details>{/if}
 </section>
<style>
 section{font-size:12px}h3,h4{color:#7dff8a}p{line-height:1.6;color:#9abc9a}.scroll{overflow:auto;margin-bottom:12px}table{border-collapse:collapse;width:100%}th,td{padding:10px;border:1px solid #294329;text-align:left;vertical-align:top;min-width:100px}form{display:grid;gap:12px;max-width:600px}label{display:grid;gap:6px}input,textarea,select,button{font:inherit;color:#b7dcb7;background:#081008;border:1px solid #2a5a2a;border-radius:2px;padding:8px;box-sizing:border-box;min-width:0}button,summary{cursor:pointer;color:#7dff8a}textarea{min-height:80px;resize:vertical}.check{display:flex;align-items:center}[role=alert]{color:#ff9292}
</style>
