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

console.log('Runner smoke passed: authenticated startup, registration, claim, mock execution, and completion.');
