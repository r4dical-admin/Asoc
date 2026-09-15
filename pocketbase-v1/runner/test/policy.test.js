import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaybook,redact,retryState,resolveAI} from '../src/policy.js';
import {normalizeGithub,normalizeJira,verifySignature} from '../src/intakes.js';
import {createHmac} from 'node:crypto';

test('parses nested YAML playbook policies',()=>{
 const p=parsePlaybook('schema_version: 1\nname: Triage\nrole: triage\nrequired_context: []\nmcp_tool_policy:\n  jira.create: require_approval\noutputs: [markdown]\nmax_runtime_sec: 30\ninstructions: decide');
 assert.equal(p.mcp_tool_policy['jira.create'],'require_approval');
});
test('validates provider secrets before execution',()=>{
 assert.throws(()=>resolveAI({}, {}, {provider:'gemini',model:'gemini-3.6-flash'},{}),/Missing API key/);
 assert.equal(resolveAI({}, {}, {provider:'mock',model:'mock'},{}).provider,'mock');
 const ollama=resolveAI({}, {}, {provider:'ollama',model:'qwen3:8b'},{});
 assert.equal(ollama.base_url,'http://127.0.0.1:11434/v1');
 const openai=resolveAI({}, {}, {provider:'openai',model:'gpt-test'},{OPENAI_API_KEY:'secret'});
 assert.equal(openai.base_url,'https://api.openai.com/v1');
});
test('redacts secrets and authorization values',()=>{
 const value=redact('Authorization: Bearer abc123 API_KEY=hidden-value',{SERVICE_SECRET:'hidden-value'});
 assert(!value.includes('abc123'));assert(!value.includes('hidden-value'));
});
test('uses bounded retries and terminal cancellation',()=>{
 assert.equal(retryState({attempt_no:1,max_attempts:3},{}).status,'queued');
 assert.equal(retryState({attempt_no:3,max_attempts:3},{}).status,'failed');
 assert.equal(retryState({attempt_no:1,max_attempts:3},{canceled:true}).status,'canceled');
});
test('verifies webhook signatures and selected scopes',()=>{
 const raw=Buffer.from('{}'), secret='test-secret', sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(verifySignature(raw,sig,secret),true);
 const gh=normalizeGithub({action:'synchronize',repository:{full_name:'o/r'},pull_request:{number:2,title:'x',body:'y',head:{sha:'h'},base:{sha:'b'},html_url:'u'}},{repositories:['o/r']},'pull_request');
 assert.equal(gh.source_key,'o/r#2');
 const jira=normalizeJira({issue:{id:'1',key:'SEC-1',fields:{project:{key:'SEC'},updated:'now'}}},{projects:['SEC'],site:'acme'});
 assert.equal(jira.source_key,'acme#1');
});
