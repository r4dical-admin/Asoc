<script lang="ts">
 import {onMount,createEventDispatcher} from 'svelte';
 import IntakeRouting from './IntakeRouting.svelte';
 import {currentUser,listUsers,inviteUser,updateUser,listRunners,listIntakes,listIntakeConfigs,createManualIntake,listTemplates,createTask,saveModelDefaults,savePlaybookDefinition} from '../lib/pocketbase';
 export let section='health';
 const dispatch=createEventDispatcher<{refresh:void}>();
 let error='',users:any[]=[],runners:any[]=[],intakes:any[]=[],configs:any[]=[],templates:any[]=[];
 let email='',role='analyst',provider='gemini',model='gemini-3.6-flash',intakeConfig='',intakeText='',taskTitle='',taskIncident='',taskTemplate='';
 let editPlaybook='',playbookDefinition='';
 async function load(){try{
   if(section==='health')runners=await listRunners();
   else if(section==='intakes')[intakes,configs]=await Promise.all([listIntakes(),listIntakeConfigs()]);
   else if(section==='tasks')templates=await listTemplates();
   else if(currentUser()?.role==='admin')[users,configs,templates]=await Promise.all([listUsers(),listIntakeConfigs(),listTemplates()]);
   if(!intakeConfig)intakeConfig=configs.find(c=>c.kind==='manual')?.id||'';
   if(!taskTemplate)taskTemplate=templates.find(t=>t.role_type==='analysis')?.external_id||'';
   if(!editPlaybook&&templates[0]){editPlaybook=templates[0].id;playbookDefinition=JSON.stringify(templates[0].definition,null,2);}
 }catch(e){error=e instanceof Error?e.message:'Panel could not load';}}
 function selectPlaybook(){playbookDefinition=JSON.stringify(templates.find(t=>t.id===editPlaybook)?.definition||{},null,2);}
 async function act(fn:()=>Promise<any>){error='';try{await fn();await load();dispatch('refresh');}catch(e){error=e instanceof Error?e.message:'Action failed';}}
 onMount(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load();},15000);return ()=>clearInterval(timer);});
</script>
<section class="panel-content">{#if error}<p class="error">{error}</p>{/if}
{#if section==='health'}<h2>Runtime health</h2><dl><dt>PocketBase</dt><dd class="ok">Connected</dd><dt>AI configuration</dt><dd>{runners[0]?.capabilities_json?.api_key_configured?'Key configured':'No key reported'}</dd></dl>{#each runners as r}<article><strong>{r.display_name}</strong><span>{r.status} · {r.capabilities_json?.launch_mode} · {r.capabilities_json?.ai_provider}/{r.capabilities_json?.ai_model}</span></article>{:else}<p>No active runner. Tasks will remain queued.</p>{/each}
{:else if section==='tasks'}<h2>Create and inspect tasks</h2>{#if currentUser()?.role!=='read-only'}<input placeholder="Task title" bind:value={taskTitle}/><input placeholder="Incident ID (optional)" bind:value={taskIncident}/><select bind:value={taskTemplate}>{#each templates as t}<option value={t.external_id}>{t.name}</option>{/each}</select><button on:click={()=>act(()=>createTask({title:taskTitle,incident_id:taskIncident,template_id:taskTemplate}))}>Queue task</button>{/if}
{:else if section==='intakes'}<h2>Intake review</h2>{#if currentUser()?.role==='admin'}<IntakeRouting on:refresh={()=>{void load();dispatch('refresh');}} />{/if}{#if currentUser()?.role!=='read-only'}<select bind:value={intakeConfig}>{#each configs.filter(c=>c.kind==='manual') as c}<option value={c.id}>{c.name}</option>{/each}</select><textarea placeholder="Report or alert details" bind:value={intakeText}></textarea><button on:click={()=>act(()=>createManualIntake(intakeConfig,{text:intakeText}))}>Submit intake</button>{/if}{#each intakes as i}<article><strong>{i.source_key||i.id}</strong><span>{i.status} · revision {i.revision||'n/a'}</span></article>{/each}
{:else}<h2>Settings</h2>{#if currentUser()?.role==='admin'}<h3>Model defaults</h3><select bind:value={provider}><option>gemini</option><option>openai</option><option>openai-compatible</option><option>ollama</option><option>mock</option></select><input bind:value={model}/><button on:click={()=>act(()=>saveModelDefaults(provider,model))}>Save non-secret defaults</button><p>API keys stay in runner environment secrets.</p><h3>Playbook policy</h3><select bind:value={editPlaybook} on:change={selectPlaybook}>{#each templates as t}<option value={t.id}>{t.name} · v{t.version}</option>{/each}</select><textarea bind:value={playbookDefinition}></textarea><button on:click={()=>act(()=>savePlaybookDefinition(editPlaybook,JSON.parse(playbookDefinition)))}>Validate and save policy</button><h3>Invite user</h3><input type="email" placeholder="analyst@example.com" bind:value={email}/><select bind:value={role}><option>admin</option><option>analyst</option><option>read-only</option></select><button on:click={()=>act(()=>inviteUser(email,role))}>Email invitation</button>{#each users as u}<article><strong>{u.email}</strong><span>{u.role} · {u.active?'active':'disabled'}</span><button on:click={()=>act(()=>updateUser(u.id,u.role,!u.active))}>{u.active?'Disable':'Enable'}</button></article>{/each}{:else}<p>Administration settings require the admin role.</p>{/if}{/if}</section>
<style>
.panel-content{font-size:11px;font-family:inherit;color:#b7dcb7;min-width:0}h2{font-size:12px;color:#7dff8a;margin:12px 0}h3{font-size:11px;margin-top:18px}input,select,textarea{box-sizing:border-box;width:100%;margin:5px 0;padding:8px;background:#081008;color:#b7dcb7;border:1px solid #2a5a2a;border-radius:2px;font:inherit}textarea{min-height:100px;resize:vertical}button{cursor:pointer;background:#102010;color:#7dff8a;border:1px solid #2a5a2a;border-radius:2px;padding:6px 9px;font:inherit;max-width:100%}button:hover{background:#193419}article{display:grid;gap:5px;border:1px solid #1b3a1b;padding:8px;margin:8px 0;border-radius:2px;overflow-wrap:anywhere}article span,p{color:#7cb37c}.error{color:#ff9292}.ok{color:#7dff8a}dl{display:grid;grid-template-columns:1fr 1fr;gap:6px}dd{margin:0}
</style>
