import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverConnections} from '../src/tools.js';
import {summarizeWorkers} from '../../frontend/src/lib/workers.js';

test('workers have real names and each task belongs to exactly one worker',()=>{
 const tasks=[{id:'1',profile_id:'analysis',status:'queued'},{id:'2',profile_id:'analysis',claimed_by_runner_id:'runner',status:'running'}];
 const rows=summarizeWorkers(tasks,[{runner_id:'runner',display_name:'Local runner',status:'online',heartbeat_at:new Date().toISOString()}],[{external_id:'analysis',name:'Analysis agent',enabled:true}],[{task_id:'2'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].name,'Local runner');assert.equal(rows[0].active,1);assert.equal(rows[0].pending,1);assert.equal(rows[0].status,'Online');assert.equal(rows[1].queued,1);assert.equal(rows.reduce((n,r)=>n+r.total,0),2);
 assert.equal(summarizeWorkers([], [{runner_id:'old',status:'online',heartbeat_at:'2020-01-01'}],[],[])[0].status,'Offline');
});
test('MCP discovery closes clients and reports names only, with no errors or secrets',async()=>{
 let closed=0;const results=[];
 await discoverConnections([{id:'ok',kind:'mcp',enabled:true},{id:'bad',kind:'mcp',enabled:true},{id:'disabled',kind:'mcp',enabled:false},{id:'web',kind:'webhook',enabled:true}],async(id,result)=>results.push({id,...result}),async([config])=>{
  if(config.id==='bad')throw new Error('Bearer do-not-expose-this');
  return {tools:[{name:'ok.search',connection_id:'ok',description:'untrusted'},{name:'asoc.search_incidents'}],clients:new Map([['ok',{close:async()=>closed++}]])};
 });
 assert.equal(closed,1);assert.deepEqual(results,[{id:'ok',status:'available',tools:[{name:'ok.search'}]},{id:'bad',status:'unavailable',tools:[]}]);
});
