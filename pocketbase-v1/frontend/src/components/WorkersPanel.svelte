<script lang="ts">
 import {onMount,createEventDispatcher} from 'svelte';
 import {pb,listRunners,type TaskRecord,type ToolCallRecord} from '../lib/pocketbase';
 import {summarizeWorkers} from '../lib/workers';
 export let tasks:TaskRecord[]=[];export let approvals:ToolCallRecord[]=[];
 const dispatch=createEventDispatcher<{openCatalog:{section:string;category?:string;title:string}}>();
 let runners:any[]=[],profiles:any[]=[],filter='',error='';
 $: workers=summarizeWorkers(tasks,runners,profiles,approvals).filter(w=>`${w.name} ${w.status} ${w.pending?'approval required':''}`.toLowerCase().includes(filter.toLowerCase()));
 async function load(){try{[runners,profiles]=await Promise.all([listRunners(),pb.collection('agent_profiles').getFullList()]);error='';}catch(e){error=e instanceof Error?e.message:'Workers could not load';}}
 onMount(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load();},15000);return ()=>clearInterval(timer);});
</script>
<input aria-label="Filter workers" type="search" placeholder="Filter workers or approval required" bind:value={filter}/>
{#if error}<p role="alert">{error}</p>{/if}
{#each workers as worker (worker.id)}<button class="worker" on:click={()=>dispatch('openCatalog',{section:'worker',category:worker.id,title:worker.name})}>
 <strong>{worker.name}</strong><span>{worker.status} · {worker.active} active · {worker.queued} queued · {worker.total} total</span>
 {#if worker.pending}<span class="approval">{worker.pending} awaiting approval</span>{/if}
</button>{:else}<p>No matching workers.</p>{/each}
<style>
 input,.worker{box-sizing:border-box;width:100%;font:inherit;color:#b7dcb7;background:#081008;border:1px solid #2a5a2a;border-radius:2px;padding:8px;margin-bottom:6px}.worker{display:grid;gap:5px;text-align:left;cursor:pointer;font-size:11px}.worker:hover{background:#193419}.worker span,p{font-size:10px;color:#7cb37c}.approval{color:#f6d365!important}[role=alert]{color:#ff9292}strong{overflow-wrap:anywhere}
</style>
