<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {approveTool,cancelTask,listArtifacts,type TaskRecord,type ToolCallRecord} from '../lib/pocketbase';
  export let task:TaskRecord;
  export let approvals:ToolCallRecord[]=[];
  export let canWrite=false;
  const dispatch=createEventDispatcher<{refresh:void}>();
  let busy=false,error='';
  async function act(action:()=>Promise<unknown>){busy=true;error='';try{await action();dispatch('refresh');}catch(e){error=e instanceof Error?e.message:'Action failed';}finally{busy=false;}}
  async function download(){const records=await listArtifacts(task.id);const url=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=(task.external_id||task.id)+'-artifacts.json';a.click();URL.revokeObjectURL(url);}
</script>
<section aria-label="Task actions">
  <div class="tools"><span>{task.status}</span><button disabled={busy} on:click={()=>act(download)}>Download transcript / artifacts</button>
    {#if canWrite && ['queued','claimed','running'].includes(task.status||'')}<button disabled={busy} on:click={()=>act(()=>cancelTask(task.id))}>Cancel task</button>{/if}
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
  {#each approvals as approval (approval.id)}
    <article><h3>Approval required · {approval.tool}</h3><pre>{JSON.stringify(approval.arguments,null,2)}</pre>
      {#if canWrite}<div class="tools"><button disabled={busy} on:click={()=>act(()=>approveTool(approval.id,true))}>Approve for this task</button><button disabled={busy} on:click={()=>act(()=>approveTool(approval.id,false))}>Deny</button></div>{:else}<p>An analyst must approve this action.</p>{/if}
    </article>
  {/each}
</section>
<style>
section{margin-bottom:14px;font-size:11px}.tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}button{font:inherit;background:#102010;border:1px solid #2a5a2a;color:#7dff8a;padding:6px 9px;border-radius:2px;cursor:pointer}button:hover{background:#193419}button:disabled{opacity:.5;cursor:wait}article{border:1px solid #927331;background:#1c1b0c;padding:12px;margin-top:10px}h3{font-size:12px;color:#f6d365;margin:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#b7dcb7}p{color:#f6d365}
</style>
