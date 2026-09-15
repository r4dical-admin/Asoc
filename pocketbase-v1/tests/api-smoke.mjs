const base = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
async function request(path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}
const json = {'content-type':'application/json'};
let auth = await request('/api/collections/users/auth-with-password',{method:'POST',headers:json,body:JSON.stringify({identity:'admin',password:process.env.ASOC_ADMIN_PASSWORD || 'password'})});
if (auth.record.must_change_password) {
  await request('/api/asoc/password',{method:'POST',headers:{...json,Authorization:auth.token},body:JSON.stringify({old_password:process.env.ASOC_ADMIN_PASSWORD || 'password',password:'asoc-smoke-password-2026'})});
  auth = await request('/api/collections/users/auth-with-password',{method:'POST',headers:json,body:JSON.stringify({identity:'admin',password:'asoc-smoke-password-2026'})});
}
const headers={...json,Authorization:auth.token};
const configs=await request('/api/collections/intake_configs/records',{headers});
const manual=configs.items.find(item=>item.kind==='manual');
const payload={config_id:manual.id,delivery_key:'smoke-'+Date.now(),payload:{summary:'Smoke test'}};
const first=await request('/api/asoc/intakes',{method:'POST',headers,body:JSON.stringify(payload)});
const duplicate=await request('/api/asoc/intakes',{method:'POST',headers,body:JSON.stringify(payload)});
if(first.id!==duplicate.id)throw new Error('Duplicate delivery created another intake.');
const chat=await request('/api/asoc/chats',{method:'POST',headers,body:JSON.stringify({title:'Smoke test'})});
await request(`/api/asoc/chats/${chat.id}/messages`,{method:'POST',headers,body:JSON.stringify({message:'hello'})});
const queued=await request('/api/asoc/tasks',{method:'POST',headers,body:JSON.stringify({title:'Cancellation smoke',template_id:'TPL-PERIODIC'})});
const service=(await request('/api/collections/services/auth-with-password',{method:'POST',headers:json,body:JSON.stringify({identity:'runner@asoc.local',password:process.env.ASOC_RUNNER_PASSWORD})}));
const serviceHeaders={...json,Authorization:service.token};
await request(`/api/asoc/tasks/${queued.id}/claim`,{method:'POST',headers:serviceHeaders,body:'{}'});
const duplicateClaim=await fetch(`${base}/api/asoc/tasks/${queued.id}/claim`,{method:'POST',headers:serviceHeaders,body:'{}'});
if(duplicateClaim.status!==400)throw new Error('Atomic claim accepted a second claim.');
await request(`/api/asoc/tasks/${queued.id}/cancel`,{method:'POST',headers});
const canceled=await request(`/api/asoc/tasks/${queued.id}/progress`,{method:'POST',headers:serviceHeaders,body:JSON.stringify({status:'canceled'})});
if(canceled.status!=='canceled')throw new Error('Running cancellation was not finalized.');
console.log('API smoke passed: auth, first-login change, intake idempotency, persisted chat, atomic claim, cancellation.');
