import fs from 'node:fs';
import path from 'node:path';
const installed=new WeakSet();
const stages=new Set(['llm','memory_llm','memory_http','recall','memory_view','turn','tool','send','send_queue','retention_gate','grounding']);
const numeric=new Set(['elapsedMs','gatewayMs','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens','inputCharacters','messageCount','factCharacters','projectedCharacters','facts','sourceCount','modelRequests','toolCalls','count']);
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
let warned=false;
export function recordMetric(stage,values={}) {
  if(!stages.has(stage)||process.env.QQBOT_METRICS_ENABLED==='false')return;
  try {
    const row={at:new Date().toISOString(),stage};
    for(const [key,value] of Object.entries(values))if(numeric.has(key)&&finite(value))row[key]=value;
    if(['ok','error','closed','aborted','blocked','shadow'].includes(values.status))row.status=values.status;
    if(['c2c','group'].includes(values.scope))row.scope=values.scope;
    if(['empty','ack','emoji','content','unverified_search','unverified_fetch'].includes(values.reason))row.reason=values.reason;
    const dir=process.env.QQBOT_METRICS_DIR||path.resolve(process.env.QQBOT_COMPANION_DIR||'data/companion','../../.run/performance');
    fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,'qq-runtime.jsonl');
    if(fs.existsSync(file)&&fs.statSync(file).size>2_000_000){fs.rmSync(file+'.previous',{force:true});fs.renameSync(file,file+'.previous');}
    fs.appendFileSync(file,JSON.stringify(row)+'\n',{encoding:'utf8',mode:0o600});
  }catch{if(!warned){warned=true;console.warn('[qq-metrics] numeric counters unavailable');}}
}
export function toOpenAIUsage(usage={}) {
  const input=finite(usage.inputTokens)?usage.inputTokens:finite(usage.input)?usage.input:undefined;
  const output=finite(usage.outputTokens)?usage.outputTokens:finite(usage.output)?usage.output:undefined;
  const cached=finite(usage.cacheReadTokens)?usage.cacheReadTokens:undefined;
  const write=finite(usage.cacheWriteTokens)?usage.cacheWriteTokens:undefined;
  const result={};
  if(input!==undefined)result.prompt_tokens=input+(cached||0)+(write||0);
  if(output!==undefined)result.completion_tokens=output;
  if(finite(usage.totalTokens))result.total_tokens=usage.totalTokens;
  else if(result.prompt_tokens!==undefined&&output!==undefined)result.total_tokens=result.prompt_tokens+output;
  if(cached!==undefined)result.prompt_tokens_details={cached_tokens:cached};
  return result;
}
export function installQQMetrics(ctx) {
  if(installed.has(ctx))return;installed.add(ctx);
  ctx.on('tools/execute',async(exec,next)=>{
    if(!exec.agent?.[Symbol.for('qqbot.identity')])return next();
    const started=performance.now();let status='error';
    try{const result=await next();status=result?.isError?'error':'ok';return result;}
    finally{recordMetric('tool',{elapsedMs:performance.now()-started,status:exec.signal?.aborted?'aborted':status});}
  });
  ctx.on('llm/stream',(request,next)=>{
    const stream=next();
    return (async function*(){
      const started=performance.now();let usage={},status='closed';
      try{
        for await(const chunk of await stream){
          if(chunk.type==='usage')usage=chunk.usage||{};
          if(chunk.type==='finish'&&['error','aborted'].includes(chunk.reason?.kind||chunk.finish?.kind||chunk.kind))status=(chunk.reason?.kind||chunk.finish?.kind||chunk.kind);
          yield chunk;
        }
        if(status==='closed')status='ok';
      }catch(error){status=request.signal?.aborted?'aborted':'error';throw error;}
      finally{
        const messages=Array.isArray(request.messages)?request.messages:[];
        const inputCharacters=messages.reduce((sum,m)=>sum+(typeof m.content==='string'?m.content.length:Array.isArray(m.content)?m.content.reduce((n,b)=>n+(typeof b.text==='string'?b.text.length:0),0):0),0);
        recordMetric('llm',{elapsedMs:performance.now()-started,messageCount:messages.length,inputCharacters,...usage,status});
      }
    })();
  });
}
