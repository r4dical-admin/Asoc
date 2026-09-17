<script lang="ts">
 import {createEventDispatcher} from 'svelte';
 import {pb} from '../lib/pocketbase';
 const dispatch=createEventDispatcher<{refresh:void}>();
 let kind='skills',title='',instructions='',role='triage',busy=false,error='',success='';
 async function save(){
  busy=true;error='';success='';
  try{
   if(!title.trim()||!instructions.trim())throw new Error('Enter a name and instructions.');
   if(kind==='playbook'){
    const policy=role==='triage'?Object.fromEntries(['asoc.search_incidents','asoc.open_incident','asoc.add_incident_note','asoc.ignore_intake','asoc.triage_decide'].map(t=>[t,'allow'])):{};
    await pb.collection('templates').create({external_id:'PB-'+crypto.randomUUID(),name:title.trim(),role_type:role,allowed_profile_roles:[role],version:1,max_runtime_sec:600,definition:{schema_version:1,name:title.trim(),role,instructions:instructions.trim(),required_context:[],outputs:['markdown'],max_runtime_sec:600,mcp_tool_policy:policy},definition_md_file:new File([instructions],'instructions.md',{type:'text/markdown'})});
   }else{
    await pb.collection('resources').create({external_id:kind+'/'+crypto.randomUUID()+'.md',title:title.trim(),category:kind,type:'markdown',status:'active',body_md_file:new File([instructions],'instructions.md',{type:'text/markdown'})});
   }
   success='Saved. The resource is available in the catalog.';title='';instructions='';dispatch('refresh');
  }catch(e){error=e instanceof Error?e.message:'Could not save resource';}finally{busy=false;}
 }
</script>
<form on:submit|preventDefault={save}>
 <label>Resource type<select bind:value={kind}><option value="skills">Skill</option><option value="intake-instructions">Intake instructions</option><option value="playbook">Playbook</option><option value="knowledge-base">Knowledge base</option></select></label>
 <label>Name<input bind:value={title} required maxlength="180" /></label>
 {#if kind==='playbook'}<label>Playbook role<select bind:value={role}><option value="triage">Triage · process intake items</option><option value="analysis">Analysis · investigate incidents</option></select></label>{/if}
 <label>Instructions (Markdown)<textarea bind:value={instructions} required></textarea></label>
 {#if kind==='playbook'}<p>Triage playbooks can be assigned to intake types. Advanced tool policies are editable in Settings.</p>{/if}
 <button disabled={busy}>{busy?'Saving…':'Save resource'}</button>
 {#if error}<p role="alert">{error}</p>{/if}{#if success}<p role="status">{success}</p>{/if}
</form>
<style>
 form{display:grid;gap:10px;padding:10px 0;font-size:11px}label{display:grid;gap:5px}input,select,textarea,button{box-sizing:border-box;width:100%;font:inherit;color:#b7dcb7;background:#081008;border:1px solid #2a5a2a;border-radius:2px;padding:8px}textarea{min-height:150px;resize:vertical}button{color:#7dff8a;cursor:pointer}p{margin:0;color:#7cb37c}[role=alert]{color:#ff9292}
</style>
