const base = process.env.POCKETBASE_URL;
const json = {'content-type':'application/json'};

async function request(path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const auth = await request('/api/collections/users/auth-with-password', {
  method: 'POST',
  headers: json,
  body: JSON.stringify({identity:'admin', password:'asoc-smoke-password-2026'}),
});
const headers = {...json, Authorization:auth.token};

let online = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const registrations = await request('/api/collections/runner_registrations/records', {headers});
  online = registrations.items.some(record => record.status === 'online');
  if (online) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!online) throw new Error('Runner did not register as online.');

const task = await request('/api/asoc/tasks', {
  method: 'POST',
  headers,
  body: JSON.stringify({title:'Runner execution smoke', template_id:'TPL-PERIODIC'}),
});

let result;
for (let attempt = 0; attempt < 80; attempt += 1) {
  result = await request(`/api/collections/tasks/records/${task.id}`, {headers});
  if (['succeeded','failed','canceled','timed_out'].includes(result.status)) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (result?.status !== 'succeeded') throw new Error(`Runner task ended in ${result?.status || 'an unknown state'}.`);

const draftRequest=await request('/api/asoc/authoring/drafts',{method:'POST',headers,body:JSON.stringify({kind:'resource',prompt:'Review this draft',draft:{title:'Runner draft',category:'skills',instructions:'Inspect evidence.'}})});
let generated;
for(let attempt=0;attempt<100;attempt++){generated=await request('/api/asoc/authoring/drafts/'+draftRequest.id,{headers});if(['succeeded','failed','canceled','timed_out'].includes(generated.status))break;await new Promise(resolve=>setTimeout(resolve,250));}
if(generated?.status!=='succeeded'||generated.error||generated.proposal?.draft?.instructions!=='Inspect evidence.')throw new Error('Runner did not produce a valid reviewable authoring draft: '+JSON.stringify(generated));
if(!generated.context?.authoring)throw new Error('The actual model context was not recorded.');
const sections=await request('/api/collections/incident_sections/records?filter='+encodeURIComponent('incident_id="INC-1002" && section="overview"'),{headers});
const operations=await request('/api/asoc/dashboards/operations',{headers});
const flow=()=>request('/api/asoc/dashboards/'+operations.dashboard.id+'/data',{method:'POST',headers,body:'{}'});
const beforeOverview=await flow();
const overviewRequest=await request('/api/asoc/authoring/drafts',{method:'POST',headers,body:JSON.stringify({kind:'overview',target_id:sections.items[0].id,prompt:'Summarize current evidence.'})});
let overview;
for(let attempt=0;attempt<100;attempt++){overview=await request('/api/asoc/authoring/drafts/'+overviewRequest.id,{headers});if(['succeeded','failed','canceled','timed_out'].includes(overview.status))break;await new Promise(resolve=>setTimeout(resolve,250));}
if(overview?.status!=='succeeded'||overview.error||!overview.proposal?.draft?.markdown||!overview.context?.sections?.length||!Array.isArray(overview.context?.task_results))throw new Error('Runner overview context and draft generation failed: '+JSON.stringify(overview));
if((await flow()).results.operations_flow.response_runs_completed!==beforeOverview.results.operations_flow.response_runs_completed)throw new Error('Authoring inflated the response-playbook funnel.');
console.log('Runner smoke passed: authenticated startup, registration, claim, mock execution, reviewable authoring draft, recorded context, and completion.');
