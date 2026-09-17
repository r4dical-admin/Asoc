<script lang="ts">
 import {onMount,createEventDispatcher} from 'svelte';
 import {listIntakeConfigs,listTemplates,listResources,saveIntakeConfig} from '../lib/pocketbase';
 const dispatch=createEventDispatcher<{refresh:void}>();
 let configs:any[]=[],playbooks:any[]=[],resources:any[]=[],id='',name='',kind='manual',playbook='',enabled=true,refs:string[]=[],config='{}',busy=false,error='',success='';
 async function load(){[configs,playbooks,resources]=await Promise.all([listIntakeConfigs(),listTemplates(),listResources()]);}
 function select(){const c=configs.find(c=>c.id===id);name=c?.name||'';kind=c?.kind||'manual';playbook=c?.playbook_id||'';enabled=c?.enabled??true;refs=c?.config?.resource_ids||[];config=JSON.stringify(c?.config||{},null,2);success='';}
 async function save(){busy=true;error='';success='';try{const parsed=JSON.parse(config);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new Error('Configuration must be a JSON object.');const saved=await saveIntakeConfig({name,kind,enabled,playbook_id:playbook,config:{...parsed,resource_ids:refs}},id||undefined);await load();id=saved.id;select();success='Saved. New items will run this triage playbook.';dispatch('refresh');}catch(e){error=e instanceof Error?e.message:'Could not save intake';}finally{busy=false;}}
 onMount(()=>{load().catch(e=>error=e.message);});
</script>
<details on:toggle={(e)=>{if(e.currentTarget.open)load().catch(e=>error=e.message);}}><summary>Configure intake routing</summary>
 <form on:submit|preventDefault={save}>
 <label>Intake type<select bind:value={id} on:change={select}><option value="">New intake type</option>{#each configs as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
 <label>Name<input bind:value={name} required /></label>
 <label>Source<select bind:value={kind}>{#each ['manual','github','jira','webhook','cron','mcp'] as source}<option>{source}</option>{/each}</select></label>
 <label>Triage playbook<select bind:value={playbook} required><option value="" disabled>Select a triage playbook</option>{#each playbooks.filter(p=>p.role_type==='triage') as p (p.id)}<option value={p.external_id}>{p.name}</option>{/each}</select></label>
 <label><span><input type="checkbox" bind:checked={enabled} /> Enabled</span></label>
 <fieldset><legend>Instructions and skills for each item</legend>{#each resources.filter(r=>['skills','intake-instructions'].includes(r.category)) as r (r.id)}<label><span><input type="checkbox" bind:group={refs} value={r.external_id} /> {r.title}</span></label>{:else}<p>Add instructions or skills from Resources.</p>{/each}</fieldset>
 <details><summary>Source configuration (JSON)</summary><textarea aria-label="Source configuration" bind:value={config}></textarea></details>
 <p>Each new delivery queues one triage task using this playbook and the selected resources. Duplicate deliveries are ignored.</p>
 <button disabled={busy}>{busy?'Saving…':'Save intake routing'}</button>
 {#if error}<p role="alert">{error}</p>{/if}{#if success}<p role="status">{success}</p>{/if}
 </form>
</details>
<style>
 details{font-size:11px;margin:10px 0}summary{cursor:pointer;color:#7dff8a}form{display:grid;gap:10px;padding:10px 0}label{display:grid;gap:5px}input:not([type=checkbox]),select,textarea,button{box-sizing:border-box;width:100%;font:inherit;color:#b7dcb7;background:#081008;border:1px solid #2a5a2a;border-radius:2px;padding:8px}textarea{min-height:100px}fieldset{border:1px solid #2a5a2a;padding:8px;display:grid;gap:6px;min-width:0}button{color:#7dff8a;cursor:pointer}p{color:#7cb37c;margin:0}[role=alert]{color:#ff9292}
</style>
