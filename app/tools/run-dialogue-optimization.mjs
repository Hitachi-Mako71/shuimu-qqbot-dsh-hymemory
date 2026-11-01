import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {createExampleSelector} from '../dsh-hymemory-plugin/dialogue-engine/example-retriever.js';
import {createHash} from 'node:crypto';
import {generationOptions} from './dialogue-experiment-config.mjs';
import {demonstrationMessages} from './dialogue-wire-messages.mjs';
const opts=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const maxTokens=Number(opts['max-tokens']||640);
if(!Number.isInteger(maxTokens)||maxTokens<240||maxTokens>4096)throw Error('Invalid output budget');
if(!/^[a-z0-9-]{1,50}$/.test(opts.tag||''))throw Error('Explicit output tag required');
const dir=path.resolve('.run/dialogue-optimization-20261029',opts.tag);if(fs.existsSync(path.join(dir,'summary.json')))throw Error('Run already exists; use a fresh tag');fs.mkdirSync(dir,{recursive:true});
const reference=opts.reference||'baseline';if(!/^[a-z0-9-]+$/.test(reference))throw Error('Invalid reference');
const before=await import(pathToFileURL(path.resolve('.run/dialogue-optimization-20261029',reference+'-engine/index.js')).href);
const after=await import('../dsh-hymemory-plugin/dialogue-engine/index.js');
const digest=directory=>{const h=createHash('sha256');for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.js')).sort())h.update(name).update(fs.readFileSync(path.join(directory,name)));return h.digest('hex');};
const sourceDigest=digest('dsh-hymemory-plugin/dialogue-engine'),referenceDigest=digest(path.resolve('.run/dialogue-optimization-20261029',reference+'-engine'));
const token=fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('MEMORY_BRIDGE_TOKEN='))?.slice(20).trim();
if(!token)throw Error('Missing local authentication');
const h=await(await fetch('http://127.0.0.1:8766/health')).json();if(h.provider!=='deepseek-account')throw Error('Wrong provider');
let embeddingCalls=0;
const retrieveExamples=opts.semantic==='true'||opts['reference-semantic']==='true'?createExampleSelector({topK:Number(opts.topk||2),embed:async(input,{signal}={})=>{
  embeddingCalls++;
  const r=await fetch('http://127.0.0.1:8765/v1/embeddings',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({input}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(3000)]):AbortSignal.timeout(3000)});
  if(!r.ok)throw Error('EmbeddingHTTP'+r.status);return (await r.json()).data.map(x=>x.embedding);
}}):undefined;
const scenes=JSON.parse(fs.readFileSync('dsh-hymemory-plugin/dialogue-engine/research/acceptance-scenes.json','utf8')).filter(s=>s.split===(opts.split||'development')&&(!opts.scene||s.id===opts.scene));
const repeat=Number(opts.repeat||1);if(![1,2,3].includes(repeat)||!scenes.length)throw Error('Invalid scenes/repeats');
const tasks=[];for(const s of scenes)for(let repetition=1;repetition<=repeat;repetition++)for(const variant of ['baseline','candidate'])tasks.push({s,repetition,variant});
const total=tasks.length,rows=[],calls=[];const begin=new Date().toISOString();
async function run(task){const {s,variant,repetition}=task;const started=performance.now();
 const generate=async request=>{const at=performance.now();const effort=opts[variant==='candidate'?'effort':'reference-effort']||'off';const r=await fetch('http://127.0.0.1:8766/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({messages:opts[variant==='candidate'?'demonstrations':'reference-demonstrations']==='roles'&&request.stage==='generate'?demonstrationMessages(request):[{role:'system',content:request.system},{role:'user',content:request.user}],max_tokens:maxTokens,reasoning_effort:effort}),signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error('BridgeHTTP'+r.status);const b=await r.json();calls.push({scene:s.id,variant,repetition,stage:request.stage,elapsedMs:performance.now()-at,usage:b.usage,responseText:b.choices[0].message.content,reasoningEffort:effort,finishReason:b.choices[0].finish_reason});if(b.choices[0].finish_reason==='length')throw Error('ModelOutputTruncated');return b.choices[0].message.content;};
 let row;try{const result=await (variant==='baseline'?before:after).generateDialogueReply(s.input,{generate,maxTokens,...generationOptions(opts,variant,retrieveExamples)});row={scene:s.id,split:s.split,variant,repetition,input:s.input,criteria:s.criteria,elapsedMs:performance.now()-started,...result};}catch(e){row={scene:s.id,variant,repetition,error:e.name+':'+e.message};}
 rows.push(row);fs.appendFileSync(path.join(dir,'candidates.jsonl'),JSON.stringify(row)+'\n');fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify({done:rows.length,total,errors:rows.filter(r=>r.error).length}));
}
await Promise.all([0,1].map(async()=>{while(tasks.length)await run(tasks.shift());}));
const summary={begin,end:new Date().toISOString(),reference,sourceDigest,referenceDigest,modelAlias:h.model,provider:h.provider,checkpoint:'not exposed',maxTokens,experimentOptions:opts,plannedCandidate:opts.planning==='true',conditionalReview:opts.review==='true',semanticExamples:opts.semantic==='true',exampleTopK:Number(opts.topk||2),embeddingCalls,repeat,split:opts.split||'development',scenes:scenes.length,results:rows.length,calls:calls.length,errors:rows.filter(r=>r.error).length,qqMessages:0,realMemoryIO:false,humanBlindEvaluation:false,callsDetail:calls};
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,callsDetail:undefined,dir}));
