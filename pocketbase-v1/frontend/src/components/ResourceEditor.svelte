<script lang="ts">
 import {onMount,createEventDispatcher} from 'svelte';
 import {pb,loadMarkdownFromFile} from '../lib/pocketbase';
 import AuthoringChat from './AuthoringChat.svelte';
 export let record:any=null;
 const dispatch=createEventDispatcher<{refresh:void;saved:any}>();
 let kind='resource',category='skills',title='',instructions='',role='triage',provider='',model='',runtime=600,requiredContext='',outputs='markdown',policy:Record<string,string>={},advanced='',baseRevision='',targetId='',context:any=null,busy=false,error='',success='',loading=true;
 const categories=['skills','intake-instructions','knowledge-base','workflows','data-sources','historic-rcas-sev1s','settings','intakes','mcps-integrations'];
 $: draft=kind==='playbook'?{title,definition:{schema_version:1,name:title,role,instructions,required_context:requiredContext.split('\n').map(v=>v.trim()).filter(Boolean),outputs:outputs.split('\n').map(v=>v.trim()).filter(Boolean),max_runtime_sec:Number(runtime),mcp_tool_policy:policy,...(provider?{ai_provider:provider}:{}),...(model?{ai_model:model}:{})}}:{title,category,instructions};
 function accept(d:any){title=d.title;if(d.definition){kind='playbook';const def=d.definition;instructions=def.instructions;role=def.role;provider=def.ai_provider||'';model=def.ai_model||'';runtime=def.max_runtime_sec;requiredContext=(def.required_context||[]).join('\n');outputs=(def.outputs||[]).join('\n');policy={...def.mcp_tool_policy};}else{kind='resource';category=d.category;instructions=d.instructions;}success='Draft loaded. Review the form, then save.';}
 async function validate(){await pb.send('/api/asoc/authoring/validate',{method:'POST',body:{kind,draft}});}
 async function save(){busy=true;error='';success='';try{await validate();const result=await pb.send('/api/asoc/authoring/save',{method:'POST',body:{kind,draft,target_id:targetId,base_revision:baseRevision}});targetId=result.record.id;baseRevision=result.base_revision;success='Saved.';dispatch('saved',result.record);dispatch('refresh');}catch(e){error=e instanceof Error?e.message:'Could not save';}finally{busy=false;}}
 async function check(){busy=true;error='';success='';try{await validate();success='Draft is valid for the current system configuration.';}catch(e){error=e instanceof Error?e.message:'Invalid draft';}finally{busy=false;}}
 async function useJSON(){try{const parsed=JSON.parse(advanced);await pb.send('/api/asoc/authoring/validate',{method:'POST',body:{kind,draft:parsed}});accept(parsed);error='';}catch(e){error=e instanceof Error?e.message:'Enter a valid draft JSON object.';}}
 onMount(()=>{void(async()=>{try{context=await pb.send('/api/asoc/authoring/context',{method:'GET'});if(record){kind=record.collectionName==='templates'?'playbook':'resource';const r=await pb.collection(kind==='playbook'?'templates':'resources').getOne(record.id);targetId=r.id;baseRevision=kind==='playbook'?String(r.version):r.body_md_file+'|'+r.catalog_updated_at;accept(kind==='playbook'?{title:r.name,definition:r.definition}:{title:r.title,category:r.category,instructions:await loadMarkdownFromFile(r,'body_md_file')});success='';}}catch(e){error=e instanceof Error?e.message:'Could not load editor';}finally{loading=false;}})();});
</script>
{#if loading}<p>Loading authoring context…</p>{:else}
<div class="authoring-layout">
 <form on:submit|preventDefault={save}>
 <label>Type<select bind:value={kind} disabled={!!targetId}><option value="resource">Resource</option><option value="playbook">Playbook</option></select></label>
 {#if kind==='resource'}<label>Category<select bind:value={category}>{#each categories as c}<option value={c}>{c==='workflows'?'Templates':c.replaceAll('-',' ')}</option>{/each}</select></label>{/if}
 <label>Name<input bind:value={title} required maxlength="180" /></label>
 {#if kind==='playbook'}
 <div class="fields"><label>Role<select bind:value={role}>{#each ['triage','analysis','chat','custom'] as r}<option>{r}</option>{/each}</select></label><label>Maximum runtime (seconds)<input type="number" min="1" max="86400" bind:value={runtime} required /></label></div>
 <div class="fields"><label>Model provider<select bind:value={provider}><option value="">System default</option>{#each ['gemini','openai','openai-compatible','ollama'] as p}<option>{p}</option>{/each}</select></label><label>Model name<input bind:value={model} placeholder="System default" /></label></div>
 <div class="fields"><label>Required context (one per line)<textarea class="short" bind:value={requiredContext}></textarea></label><label>Outputs (one per line)<textarea class="short" bind:value={outputs}></textarea></label></div>
 <details><summary>Tool permissions</summary><p>Tools default to denied. An enabled agent profile must also allow every selected tool.</p>{#each [...new Set([...(context?.available_tools||[]),...Object.keys(policy)])] as tool}<label>{tool}<select value={policy[tool]||'deny'} on:change={e=>policy={...policy,[tool]:e.currentTarget.value}}><option>deny</option><option>allow</option><option>require_approval</option></select></label>{/each}</details>
 {/if}
 <label>Instructions (Markdown)<textarea bind:value={instructions} required maxlength="100000" ></textarea></label>
 <details><summary on:click={()=>advanced=JSON.stringify(draft,null,2)}>Advanced draft JSON</summary><textarea aria-label="Draft JSON" bind:value={advanced}></textarea><button type="button" on:click={useJSON}>Load JSON into form</button></details>
 <div class="fields"><button type="button" disabled={busy} on:click={check}>Validate draft</button><button disabled={busy}>{busy?'Saving…':targetId?'Save changes':'Create resource'}</button></div>
 {#if error}<p role="alert">{error}</p>{/if}{#if success}<p role="status">{success}</p>{/if}
 </form>
 {#key kind}<AuthoringChat {kind} targetId={targetId} {draft} {context} on:accept={e=>accept(e.detail)} />{/key}
</div>{/if}
<style>
 .authoring-layout{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px;font-size:12px}form,label{display:grid;gap:7px}form{align-content:start;gap:14px}input,select,textarea,button{box-sizing:border-box;width:100%;font:inherit;color:#b7dcb7;background:#081008;border:1px solid #2a5a2a;border-radius:2px;padding:9px}textarea{min-height:220px;resize:vertical}.short{min-height:65px}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}button,summary{color:#7dff8a;cursor:pointer}button:disabled{opacity:.5}details{border:1px solid #294329;padding:10px}details label{margin-top:8px}p{margin:0;color:#7cb37c;line-height:1.6}[role=alert]{color:#ff9292}
</style>
