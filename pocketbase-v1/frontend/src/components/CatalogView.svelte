<script lang="ts">
 import {onMount,createEventDispatcher} from 'svelte';
 import {pb,listResources,listRunners,listIntakes,listIntakeConfigs,listTasks,currentUser} from '../lib/pocketbase';
 import ControlPanel from './ControlPanel.svelte';
 import ResourceEditor from './ResourceEditor.svelte';
 export let section='';export let category='';
 const dispatch=createEventDispatcher<{openResource:{resource:any};openTask:{task:any};refresh:void}>();
 let rows:any[]=[],loading=true,busy=false,error='',search='',sort='title',ascending=true;
 const dates=['created','updated'];
 function value(r:any,key:string):string{
  if(key==='title')return r.title||r.name||r.display_name||r.source_key||r.key||r.external_id||r.id;
  if(key==='created')return r.catalog_created_at||r.created||r.received_at||r.created_at||'';
  if(key==='updated')return r.catalog_updated_at||r.updated||'';
  if(key==='status')return r.status||(typeof r.enabled==='boolean'?(r.enabled?'Enabled':'Disabled'):'');
  if(key==='type')return r.role_type||r.kind||r.category||'';
  if(key==='created_by')return r.created_by||r.created_by_user_id||'Not recorded';
  return String(r[key]??'');
 }
 $: columns=[['title','Name'],['type','Type'],['status','Status'],...(section==='intakes'?[['playbook_id','Triage playbook'],['task_id','Task']]:[]),...(category==='playbooks'?[['version','Version']]:[]),...(section==='health'?[['heartbeat_at','Last heartbeat']]:[]),['created','Created'],['updated','Updated'],['created_by','Created by'],['id','Record ID']];
 $: filtered=rows.filter(r=>columns.some(([key])=>value(r,key).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>value(a,sort).localeCompare(value(b,sort),undefined,{numeric:true})*(ascending?1:-1));
 async function load(){if(busy)return;busy=true;error='';try{
   if(section==='add')rows=[];
   else if(section==='health')rows=await listRunners();
   else if(section==='intakes'){const [configs,items]=await Promise.all([listIntakeConfigs(),listIntakes()]);rows=[...configs,...items.map(i=>({...i,type:'item',kind:'Delivery'}))];}
   else if(section==='settings')rows=currentUser()?.role==='admin'?await pb.collection('settings').getFullList():[];
   else if(section==='worker')rows=(await listTasks()).filter(t=>(t.claimed_by_runner_id||t.profile_id||t.role_type||'unassigned')===category);
   else if(section==='workers')rows=await listRunners();
   else rows=(await listResources()).filter(r=>section==='help'?['settings','intakes'].includes(r.category||''):!category||r.category===category);
 }catch(e){error=e instanceof Error?e.message:'Could not load section';}finally{loading=false;busy=false;}}
 function open(r:any){if(r.collectionName==='resources'||r.collectionName==='templates')dispatch('openResource',{resource:r});else if(r.collectionName==='tasks')dispatch('openTask',{task:r});}
 onMount(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load();},15000);return ()=>clearInterval(timer);});
</script>
<section class="catalog">
 {#if section!=='add'}
 <div class="toolbar"><input type="search" aria-label="Filter section table" placeholder="Search names, metadata, or IDs" bind:value={search}/><span>{filtered.length} items</span><button disabled={busy} on:click={load}>Refresh</button></div>
 <p class="hint">Dates use your local time. “Not recorded” means the original metadata is unavailable.</p>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if loading}<p>Loading records…</p>{:else}<div class="table-scroll"><table><thead><tr>{#each columns as [key,label]}<th aria-sort={sort===key?(ascending?'ascending':'descending'):'none'}><button on:click={()=>{ascending=sort===key?!ascending:true;sort=key;}}>{label}{sort===key?(ascending?' ↑':' ↓'):''}</button></th>{/each}</tr></thead><tbody>
 {#each filtered as row (row.collectionName+row.id)}<tr>{#each columns as [key]}<td>{#if key==='title'&&['resources','templates','tasks'].includes(row.collectionName)}<button class="item" on:click={()=>open(row)}>{value(row,key)}</button>{:else if dates.includes(key)||key==='heartbeat_at'}{value(row,key)?new Date(value(row,key)).toLocaleString():'Not recorded'}{:else}{value(row,key)||'—'}{/if}</td>{/each}</tr>{:else}<tr><td colspan={columns.length}>No matching records.</td></tr>{/each}
 </tbody></table></div>{/if}
 {/if}
 {#if ['health','intakes','settings'].includes(section)}<details class="manage"><summary>Manage {section==='health'?'runtime health':section}</summary><ControlPanel {section} on:refresh={()=>{void load();dispatch('refresh');}} /></details>
 {:else if section==='add'}<ResourceEditor on:refresh={()=>{void load();dispatch('refresh');}} />{/if}
</section>
<style>
 .catalog{min-width:0;font-size:12px}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}input{flex:1;min-width:180px}input,button{font:inherit;color:#b7dcb7;background:#081008;border:1px solid #2a5a2a;padding:8px;border-radius:2px}button{cursor:pointer}.hint{font-size:11px;color:#7cb37c}.table-scroll{overflow:auto;max-width:100%;border:1px solid #2a5a2a}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:10px;border-bottom:1px solid #1b3a1b;vertical-align:top;min-width:120px;max-width:300px;overflow-wrap:anywhere}th{background:#102010;position:sticky;top:0}th button{border:0;padding:0;font-weight:bold;white-space:nowrap}.item{border:0;padding:0;text-align:left;color:#7dff8a}.manage{margin-top:20px;max-width:700px}.manage summary{cursor:pointer;color:#7dff8a}[role=alert]{color:#ff9292}
</style>
