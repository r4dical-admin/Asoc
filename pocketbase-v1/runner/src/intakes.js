import http from 'node:http';
import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {CronExpressionParser} from 'cron-parser';
import {redact} from './policy.js';
export function verifySignature(raw,signature,secret){if(!secret||!signature)return false;const expected='sha256='+createHmac('sha256',secret).update(raw).digest('hex');return expected.length===signature.length&&timingSafeEqual(Buffer.from(expected),Buffer.from(signature));}
export function normalizeGithub(payload,config,event){
  if(event!=='pull_request'||!['opened','synchronize','edited','reopened'].includes(payload.action))return null;
  if(!config.repositories?.includes(payload.repository?.full_name))return null;
  const pr=payload.pull_request;
  return {source_key:payload.repository.full_name+'#'+pr.number,revision:pr.head.sha,payload:{repository:payload.repository.full_name,number:pr.number,title:pr.title,description:pr.body,head_sha:pr.head.sha,base_sha:pr.base.sha,html_url:pr.html_url,action:payload.action}};
}
export function normalizeJira(payload,config){const issue=payload.issue;if(!issue||!config.projects?.includes(issue.fields?.project?.key))return null;return {source_key:config.site+'#'+issue.id,revision:issue.fields.updated||'',payload:{key:issue.key,id:issue.id,fields:issue.fields,changelog:payload.changelog}};}
export function startIntakes(pb,isStopping){
  const receive=body=>pb.send('/api/asoc/intakes/receive',{method:'POST',body});
  const server=http.createServer(async(req,res)=>{
    try{
      const match=req.url?.match(/^\/webhooks\/([a-z0-9]+)$/);if(req.method!=='POST'||!match){res.writeHead(404).end();return;}
      const config=await pb.collection('intake_configs').getOne(match[1]);if(!config.enabled)throw new Error('Intake disabled');
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw new Error('Payload too large');chunks.push(chunk);}const raw=Buffer.concat(chunks);
      const secret=process.env[config.config.secret_env];
      if(config.kind==='github'){
        if(!verifySignature(raw,req.headers['x-hub-signature-256'],secret)){res.writeHead(401).end();return;}
      }else{
        const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!secret||!token||token.length!==secret.length||!timingSafeEqual(Buffer.from(token),Buffer.from(secret))){res.writeHead(401).end();return;}
      }
      const payload=JSON.parse(raw.toString());let data;
      if(config.kind==='github'){
        data=normalizeGithub(payload,config.config,req.headers['x-github-event']);
        if(data){
          const token=process.env[config.config.token_env];if(!token)throw new Error('GitHub token environment secret is missing');
          const repository=data.payload.repository;if(!/^[\w.-]+\/[\w.-]+$/.test(repository))throw new Error('Invalid repository');
          const diff=await fetch('https://api.github.com/repos/'+repository+'/pulls/'+data.payload.number,{headers:{Accept:'application/vnd.github.diff',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
          if(!diff.ok)throw new Error('GitHub diff fetch failed: '+diff.status);data.payload.diff=await diff.text();
        }
      }else if(config.kind==='jira')data=normalizeJira(payload,config.config);
      else if(config.kind==='webhook')data={source_key:payload.source_key||'',revision:payload.revision||'',payload};
      else throw new Error('Unsupported webhook kind');
      if(!data){res.writeHead(202).end(JSON.stringify({ignored:true,reason:'Event is outside configured intake scope'}));return;}
      data.delivery_key=String(req.headers['x-github-delivery']||req.headers['x-atlassian-webhook-identifier']||req.headers['x-delivery-id']||createHash('sha256').update(raw).digest('hex'));
      const result=await receive({config_id:config.id,...data});res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({id:result.id}));
    }catch(error){console.error('Webhook:',redact(error.message));res.writeHead(400).end(JSON.stringify({error:'Intake could not be processed; check configuration and runner logs.'}));}
  });
  if(process.env.INTAKE_PORT)server.listen(Number(process.env.INTAKE_PORT),process.env.INTAKE_HOST||'0.0.0.0');
  const tick=async()=>{try{const configs=await pb.collection('intake_configs').getFullList({filter:'kind="cron" && enabled=true'});const now=new Date();for(const c of configs){const scheduled=CronExpressionParser.parse(c.config.cron,{currentDate:new Date(now.getTime()+1),tz:c.config.timezone||'UTC'}).prev().toDate();if(now-scheduled>65000)continue;await receive({config_id:c.id,delivery_key:'cron:'+scheduled.toISOString(),source_key:c.id,revision:scheduled.toISOString(),payload:{scheduled_at:scheduled.toISOString(),...c.config.input}});}}catch(err){console.error('Scheduler:',redact(err.message));}if(!isStopping())setTimeout(tick,15000).unref();else server.close();};void tick();
}
