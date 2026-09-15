import {readFile} from 'node:fs/promises';
import readline from 'node:readline';
import {redact} from './policy.js';
import {chatTurn} from './openai-chat.js';
const bundle=JSON.parse(await readFile(process.env.ASOC_BUNDLE_PATH,'utf8'));
const pending=new Map();
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{try{const m=JSON.parse(line);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}}catch{}});
function emit(data){process.stdout.write(JSON.stringify(redact(data))+'\n');}
async function toolCall(tool,args){const id=crypto.randomUUID();emit({type:'tool.request',id,tool,arguments:args});return new Promise(resolve=>pending.set(id,resolve));}
async function main(){
  const ai=bundle.ai;
  const messages=[{role:'system',content:bundle.system_prompt}, {role:'user',content:bundle.prompt},...(bundle.messages||[])];
  for(let round=0;round<24;round++){
    const {text,calls}=await chatTurn({ai,messages,tools:bundle.tools,onDelta:delta=>emit({type:'delta',text:delta})});
    messages.push({role:'assistant',content:text||null,...(calls.length?{tool_calls:calls}:{})});
    if(!calls.length){emit({type:'completed',text});return;}
    for(const call of calls){let args;try{args=JSON.parse(call.function.arguments);}catch{throw new Error('Model returned invalid tool arguments.');}const tool=bundle.tool_names[call.function.name];if(!tool)throw new Error('Model requested an unavailable tool: '+call.function.name);const result=await toolCall(tool,args);messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result.result??{error:result.error})});}
  }
  throw new Error('Tool round limit exceeded.');
}
main().then(()=>process.exit(0)).catch(error=>{emit({type:'error',message:redact(error.message)});process.exit(1);});
