export const workerKey = task => task.claimed_by_runner_id || task.profile_id || task.role_type || 'unassigned';
export function summarizeWorkers(tasks, runners, profiles, approvals, now = Date.now()) {
  const rows = new Map();
  for (const runner of runners) {
    const key = runner.runner_id || runner.external_id || runner.id;
    rows.set(key, {id:key, name:runner.display_name || key, type:'Runner', state:runner.status==='online' && now-Date.parse(runner.heartbeat_at || '')<90000?'Online':'Offline', tasks:[]});
  }
  for (const profile of profiles.filter(p=>p.enabled)) rows.set(profile.external_id, {id:profile.external_id,name:profile.name || profile.external_id,type:'Agent profile',state:'Idle',tasks:[]});
  for (const task of tasks) {
    const key=workerKey(task);
    if(!rows.has(key)) rows.set(key,{id:key,name:key,type:'Worker',state:'Unknown',tasks:[]});
    rows.get(key).tasks.push(task);
  }
  return [...rows.values()].map(row=>{
    const active=row.tasks.filter(t=>['claimed','running'].includes(t.status)).length;
    const queued=row.tasks.filter(t=>t.status==='queued').length;
    const pending=approvals.filter(a=>row.tasks.some(t=>t.id===a.task_id)).length;
    return {...row,title:row.name,status:row.type==='Agent profile'?(active?'Working':queued?'Queued':'Idle'):row.state,active,queued,pending,total:row.tasks.length};
  }).sort((a,b)=>b.pending-a.pending || b.active-a.active || a.name.localeCompare(b.name));
}
