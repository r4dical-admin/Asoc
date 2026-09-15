import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTurn,readSSE,requestHeaders} from '../src/openai-chat.js';

function stream(...chunks) {
  const encoder=new TextEncoder();
  return new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(encoder.encode(chunk));controller.close();}});
}

test('selects provider-specific bearer credentials',()=>{
 assert.equal(requestHeaders({provider:'gemini'},{GEMINI_API_KEY:'gemini-key'}).Authorization,'Bearer gemini-key');
 assert.equal(requestHeaders({provider:'openai'},{OPENAI_API_KEY:'openai-key'}).Authorization,'Bearer openai-key');
 assert.equal(requestHeaders({provider:'ollama'},{}).Authorization,'Bearer ollama');
 assert.equal(requestHeaders({provider:'openai-compatible'},{AI_API_KEY:'compatible-key'}).Authorization,'Bearer compatible-key');
});

test('parses streaming text when the final SSE block has no trailing separator',async()=>{
 const events=[];
 await readSSE(stream('data: {"choices":[{"delta":{"content":"hel','lo"}}]}\n\ndata: [DONE]'),event=>events.push(event));
 assert.equal(events[0].choices[0].delta.content,'hello');
});

test('uses one OpenAI-compatible request shape for Gemini, OpenAI, and Ollama',async()=>{
 for(const [provider,env] of [['gemini',{GEMINI_API_KEY:'g'}],['openai',{OPENAI_API_KEY:'o'}],['ollama',{}]]) {
  let request;
  const result=await chatTurn({
   ai:{provider,model:'test-model',base_url:'http://model.local/v1',request_timeout_ms:1000},
   messages:[{role:'user',content:'hello'}],env,
   fetchImpl:async(url,options)=>{request={url,options};return new Response(stream('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'),{status:200,headers:{'content-type':'text/event-stream'}});}
  });
  assert.equal(request.url,'http://model.local/v1/chat/completions');
  assert.deepEqual(JSON.parse(request.options.body),{model:'test-model',messages:[{role:'user',content:'hello'}],stream:true});
  assert.equal(result.text,'ok');
 }
});

test('reassembles streamed tool calls',async()=>{
 const result=await chatTurn({
  ai:{provider:'ollama',model:'test',base_url:'http://model.local/v1',request_timeout_ms:1000},messages:[],tools:[{type:'function',function:{name:'lookup'}}],env:{},
  fetchImpl:async()=>new Response(stream(
   'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"look","arguments":"{\\"id\\":"}}]}}]}\n\n',
   'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"up","arguments":"7}"}}]}}]}\n\ndata: [DONE]\n\n'
  ),{status:200})
 });
 assert.deepEqual(result.calls,[{id:'call-1',type:'function',function:{name:'lookup',arguments:'{"id":7}'}}]);
});
