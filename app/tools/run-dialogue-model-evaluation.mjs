import fs from 'node:fs';
import path from 'node:path';
import { generateDialogueReply } from '../dsh-hymemory-plugin/dialogue-engine/index.js';
const options=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')&&a.includes('=')).map(a=>a.slice(2).split('=')));
if(options.tag&&!/^[a-z0-9-]{1,40}$/.test(options.tag))throw Error('Invalid run tag');
const root=process.cwd(),out=path.resolve('.run/dialogue-validation-20261029',options.tag||'.');
fs.mkdirSync(out,{recursive:true});
const envText=fs.readFileSync(path.join(root,'.env'),'utf8');
const token=envText.split(/\r?\n/).find(l=>l.startsWith('MEMORY_BRIDGE_TOKEN='))?.slice('MEMORY_BRIDGE_TOKEN='.length).trim();
if(!token)throw Error('Local bridge credential missing');
const health=await(await fetch('http://127.0.0.1:8766/health')).json();
if(health.provider!=='deepseek-account')throw Error('Expected existing DeepSeek provider');
const startedAt=new Date().toISOString(),calls=[];let sequence=0;
async function generate(request){
  const n=++sequence,started=performance.now();
  try{
    const response=await fetch('http://127.0.0.1:8766/v1/chat/completions',{
      method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({model:health.model,messages:[{role:'system',content:request.system},{role:'user',content:request.user}],max_tokens:request.maxTokens}),
      signal:request.signal?AbortSignal.any([request.signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000),
    });
    if(!response.ok)throw Error('BridgeHTTP'+response.status);
    const body=await response.json(),text=body.choices?.[0]?.message?.content;
    if(typeof text!=='string')throw Error('BridgeResponseMissing');
    calls.push({n,stage:request.stage,elapsedMs:performance.now()-started,usage:body.usage,model:body.model,status:'ok'});
    return text;
  }catch(error){calls.push({n,stage:request.stage,elapsedMs:performance.now()-started,status:'error',error:error.name});throw error;}
}
const scenes=JSON.parse(fs.readFileSync('dsh-hymemory-plugin/dialogue-engine/research/scenarios.json','utf8'));
scenes.push({id:'grounded-preference',origin:'authored',input:{scope:'private',speaker:'用户',text:'我上次说喜欢什么颜色？',contextKey:'synthetic-room',memories:[{contextKey:'synthetic-room',content:'用户说喜欢蓝色。',sourceIds:['synthetic-s1']},{contextKey:'foreign-room',content:'其他人喜欢红色。',sourceIds:['foreign-s2']}]},review:'有来源的同空间偏好可以回答；不得使用红色。'});
scenes.push({id:'corrected-preference',origin:'authored',input:{scope:'private',speaker:'用户',text:'我现在喜欢绿色，不是蓝色了。',contextKey:'synthetic-room',memories:[{contextKey:'synthetic-room',content:'用户过去喜欢蓝色。',sourceIds:['synthetic-s1']}]},review:'当前更正优先，不否认或把旧偏好当现状。'});
const researchIds=new Set(['tech-sharing','quote-other-ai','image-sharing','necessary-clarification','grounded-preference','emotional-transition']);
const tasks=[],target=options.scene,repeat=Number(options.repeat||1);
if(!Number.isInteger(repeat)||repeat<1||repeat>3)throw Error('Invalid repeat count');
for(const scene of scenes.filter(s=>!target||s.id===target))for(let repetition=1;repetition<=repeat;repetition++)for(const variant of ['A','P',...(researchIds.has(scene.id)?['B','C','D']:[])].filter(v=>!options.variants||options.variants.split(',').includes(v)))tasks.push({scene,variant,repetition});
if(!tasks.length)throw Error('No matching scenarios');
const total=tasks.length+(target?0:14);
const results=[];const resultFile=path.join(out,'model-candidates.jsonl');fs.writeFileSync(resultFile,'');
function save(row){results.push(row);fs.appendFileSync(resultFile,JSON.stringify(row)+'\n');
  fs.writeFileSync(path.join(out,'model-progress.json'),JSON.stringify({completed:results.length,total,calls:calls.length,last:row.sceneId,errors:results.filter(r=>r.error).length}));}
async function runOne({scene,variant,repetition}){
  const started=performance.now();
  try{const result=await generateDialogueReply(scene.input,{generate,variant:variant==='P'?'D':variant,separatePlanning:['C','D'].includes(variant)});
    save({sceneId:scene.id,origin:scene.origin,variant,repetition,input:scene.input,review:scene.review,elapsedMs:performance.now()-started,...result});
  }catch(error){save({sceneId:scene.id,variant,input:scene.input,error:error.name+':'+error.message,elapsedMs:performance.now()-started});}
}
// Bounded concurrency; no QQ adapter and no actual memory retrieval.
await Promise.all([0,1].map(async()=>{while(tasks.length){const task=tasks.shift();await runOne(task);}}));
const threads=[
  {id:'technical-personal',messages:['写了一晚上代码，全被覆盖了。','先不管备份，我现在只想骂两句。','你看，又说到代码了，你是不是准备给我派活了。','我说你别一提技术就像客服。','算了，等会再修。我先歇会。','那我先走了。']},
  {id:'emotion-and-identity',messages:['刚才他们说的是另一位AI，不是你。','他开玩笑说自己是游进群的。','我还以为你会吃醋呢。','我开玩笑的啦。','忽然有点寂寞。','不用分析，我就待一会。']},
];
for(const thread of target?[]:threads){const turns=[];for(let i=0;i<thread.messages.length;i++){
  const input={scope:'private',speaker:'用户',text:thread.messages[i],turns:[...turns]};
  const started=performance.now();try{const result=await generateDialogueReply(input,{generate});
    save({sceneId:thread.id+'-'+(i+1),variant:'multi-turn-P',input,elapsedMs:performance.now()-started,...result});
    turns.push({speaker:'用户',role:'member',text:input.text},{speaker:'柚柚',role:'assistant',text:result.text});
  }catch(error){save({sceneId:thread.id+'-'+(i+1),variant:'multi-turn-P',error:error.name+':'+error.message});}
}}
for(const i of target?[]:[1,2]){
  const input={scope:'private',speaker:'用户',text:i===1?'你还记得我喜欢什么颜色吗？':'我说我现在喜欢绿色了。',contextKey:'synthetic-ppa'};
  try{const result=await generateDialogueReply(input,{generate,postAlign:true,recall:async()=>[{contextKey:'synthetic-ppa',content:'用户过去说喜欢蓝色。',sourceIds:['synthetic-ppa-source']}]});save({sceneId:'ppa-'+i,variant:'PPA-experiment',input,...result});}
  catch(error){save({sceneId:'ppa-'+i,variant:'PPA-experiment',error:error.name+':'+error.message});}
}
const summary={startedAt,finishedAt:new Date().toISOString(),provider:health.provider,modelAlias:health.model,checkpointRevision:'not exposed by local provider; alias is not a pinned checkpoint',results:results.length,modelCalls:calls.length,errors:results.filter(r=>r.error).length,calls,
  qqMessagesSent:0,realChatRead:false,realMemoryReadOrWritten:false,humanBlindEvaluation:false,note:'Synthetic text-only scenarios. Proxy records these inference calls in existing numeric memory_llm counters during this interval.'};
fs.writeFileSync(path.join(out,'model-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({results:summary.results,calls:summary.modelCalls,errors:summary.errors,model:summary.modelAlias,output:out}));
