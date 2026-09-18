<script lang="ts">
 import {onDestroy,createEventDispatcher} from 'svelte';
 import {pb} from '../lib/pocketbase';
 import {renderMarkdown} from '../lib/markdown';
 export let kind='resource',targetId='',draft:any={},context:any=null;
 const dispatch=createEventDispatcher<{accept:any;applied:any}>();
 let prompt='',busy=false,error='',request:any=null,history:{role:string;content:string}[]=[],timer:ReturnType<typeof setTimeout>,disposed=false;
 const terminal=['succeeded','failed','canceled','timed_out'];
 async function poll(){
  try{const result=await pb.send(`/api/asoc/authoring/drafts/${request.id}`,{method:'GET'});if(disposed)return;request=result;context=result.context;
   if(terminal.includes(result.status)){busy=false;error=result.error||'';if(result.proposal)history=[...history,{role:'assistant',content:JSON.stringify(result.proposal)}];return;}
  }catch(e){if(disposed)return;error=e instanceof Error?e.message:'Could not check draft';busy=false;return;}
  timer=setTimeout(poll,1500);
 }
 async function send(){if(!prompt.trim()||busy)return;busy=true;error='';request=null;
  try{const message=prompt;request=await pb.send('/api/asoc/authoring/drafts',{method:'POST',body:{kind,target_id:targetId,draft,history,prompt:message}});context=request.context;history=[...history,{role:'user',content:message}];prompt='';await poll();}
  catch(e){error=e instanceof Error?e.message:'Could not request draft';busy=false;}
 }
 async function apply(){busy=true;error='';try{const record=await pb.send(`/api/asoc/authoring/drafts/${request.id}/apply`,{method:'POST'});request={...request,applied_at:new Date().toISOString()};dispatch('applied',record);}catch(e){error=e instanceof Error?e.message:'Could not replace overview';}finally{busy=false;}}
 onDestroy(()=>{disposed=true;clearTimeout(timer);});
</script>
<aside aria-label="Authoring assistant">
 <h3>{kind==='overview'?'Regenerate overview':'Authoring assistant'}</h3>
 <p>{kind==='overview'?'The agent reviews the current incident sections, notes, task results, and artifacts. Review its draft before replacing the overview.':'Describe what you need, or ask the agent to review this draft. Accept proposed edits into the form, then Save to publish them.'}</p>
 {#each history.filter(m=>m.role==='user') as message}<p class="request">{message.content}</p>{/each}
 <form on:submit|preventDefault={send}><label>Request<textarea bind:value={prompt} maxlength="12000" placeholder={kind==='overview'?'Summarize impact, evidence, and next steps.':'Help me write or improve this resource…'} required ></textarea></label><button disabled={busy}>{busy?`Preparing draft · ${request?.status||'starting'}`:'Ask agent'}</button></form>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if request?.proposal&&!request.error}<section class="proposal"><h4>Proposed draft</h4><p>{request.proposal.explanation}</p>
 {#if kind==='overview'}<div class="markdown">{@html renderMarkdown(request.proposal.draft.markdown)}</div>{:else}<pre>{JSON.stringify(request.proposal.draft,null,2)}</pre>{/if}
 {#if request.applied_at}<p role="status">Overview replaced.</p>{:else if kind==='overview'}<button disabled={busy} on:click={apply}>Replace overview with this draft</button>{:else}<button disabled={busy} on:click={()=>dispatch('accept',request.proposal.draft)}>Use proposed draft in form</button>{/if}
 </section>{/if}
 {#if context}<details><summary>{request?'Context used by the agent':'Available system context'}</summary><pre>{JSON.stringify(context,null,2)}</pre></details>{/if}
</aside>
<style>
 aside{min-width:0;border:1px solid #2a5a2a;padding:14px;font-size:12px;background:#0b150b}h3{margin:0 0 10px;color:#7dff8a}p{line-height:1.6;color:#9abc9a}form,label{display:grid;gap:8px}textarea,button{box-sizing:border-box;width:100%;font:inherit;color:#b7dcb7;background:#081008;border:1px solid #2a5a2a;padding:9px;border-radius:2px}textarea{min-height:95px;resize:vertical}button,summary{cursor:pointer;color:#7dff8a}button:disabled{opacity:.6}.request,.proposal{padding:10px;border:1px solid #294329;overflow-wrap:anywhere}.proposal h4{margin:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:400px;overflow:auto;font-size:11px}details{margin-top:14px}[role=alert]{color:#ff9292}.markdown{max-height:460px;overflow:auto}
</style>
