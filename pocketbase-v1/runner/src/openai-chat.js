function apiKey(ai,env) {
  if(ai.provider==='gemini')return env.GEMINI_API_KEY||env.AI_API_KEY;
  if(ai.provider==='openai')return env.OPENAI_API_KEY||env.AI_API_KEY;
  if(ai.provider==='ollama')return env.OLLAMA_API_KEY||env.AI_API_KEY||'ollama';
  return env.AI_API_KEY||env.OPENAI_API_KEY;
}

export function requestHeaders(ai,env=process.env) {
  const key=apiKey(ai,env);
  if(!key)throw new Error('Missing API key for '+ai.provider+'.');
  return {'Content-Type':'application/json','Accept':'text/event-stream',Authorization:'Bearer '+key};
}

async function dispatch(block,onEvent) {
  for(const line of block.split('\n')) {
    if(!line.startsWith('data:'))continue;
    const data=line.slice(5).trim();
    if(data&&data!=='[DONE]')await onEvent(JSON.parse(data));
  }
}

export async function readSSE(stream,onEvent) {
  const reader=stream.getReader();const decoder=new TextDecoder();let buffer='';
  while(true) {
    const {done,value}=await reader.read();
    buffer+=decoder.decode(value||new Uint8Array(),{stream:!done}).replace(/\r\n/g,'\n');
    let end;
    while((end=buffer.indexOf('\n\n'))>=0) {await dispatch(buffer.slice(0,end),onEvent);buffer=buffer.slice(end+2);}
    if(done)break;
  }
  if(buffer.trim())await dispatch(buffer,onEvent);
}

export async function chatTurn({ai,messages,tools=[],env=process.env,onDelta=()=>{},fetchImpl=fetch,signal}) {
  const timeout=AbortSignal.timeout(ai.request_timeout_ms||120000);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await fetchImpl(ai.base_url.replace(/\/$/,'')+'/chat/completions',{
    method:'POST',headers:requestHeaders(ai,env),signal:combined,
    body:JSON.stringify({model:ai.model,messages,stream:true,...(tools.length?{tools,tool_choice:'auto'}:{})})
  });
  if(!response.ok) {
    const detail=(await response.text()).slice(0,1000).replace(/\s+/g,' ');
    throw new Error('AI request failed: HTTP '+response.status+(detail?' — '+detail:''));
  }
  let text='';const calls=[];
  await readSSE(response.body,async event=>{
    if(event.error)throw new Error(event.error.message||'AI stream failed.');
    const delta=event.choices?.[0]?.delta||{};
    if(typeof delta.content==='string'&&delta.content) {text+=delta.content;await onDelta(delta.content);}
    for(const c of delta.tool_calls||[]) {
      const index=Number.isInteger(c.index)?c.index:calls.length;
      const target=calls[index]||={id:'',type:'function',function:{name:'',arguments:''}};
      if(c.id)target.id=c.id;
      if(c.function?.name)target.function.name+=c.function.name;
      if(c.function?.arguments)target.function.arguments+=c.function.arguments;
    }
  });
  return {text,calls:calls.filter(Boolean)};
}
