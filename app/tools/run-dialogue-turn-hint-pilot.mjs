import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomInt,createHash} from 'node:crypto';

const tag=process.argv[2]||'';
if(!/^[a-z0-9-]{1,50}$/.test(tag))throw Error('Explicit output tag required');
const repetitions=Number(process.argv.find(x=>x.startsWith('--repeat='))?.slice(9)||2);
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>3)throw Error('Repeat must be 1..3');
const finalizeOnly=process.argv.includes('--finalize');
const output=path.resolve('.run/dialogue-optimization-20261029',tag);
if(fs.existsSync(output)&&!finalizeOnly)throw Error('Output tag already exists');
if(!fs.existsSync(output))fs.mkdirSync(output,{recursive:true});
if(finalizeOnly){
  const rows=fs.readFileSync(path.join(output,'blinded-candidates.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const calls=rows.flatMap(r=>[r.A,r.B]).filter(c=>c.arm).map(({text,...c})=>c);
  const metadata=rows.flatMap(r=>[r.A,r.B]).filter(c=>c.arm);
  const lines=['# 盲化回复比较表','','每组请选择：A更合适 / B更合适 / 两条都可以 / 两条都不行。重点看回复是否听懂当前话轮、有没有替对方决定要做什么、是否自然。短不自动代表好。',''];
  for(const r of rows)lines.push(`## ${r.scene}（第${r.rep}次）`,'',`场景：${r.utterance}${r.quotedText?`\n引用内容：${r.quotedText}`:''}`,`观察点：${r.criteria}`,'',`**A**：${r.A.text||'（生成失败）'}`,'',`**B**：${r.B.text||'（生成失败）'}`,'','选择：________　简短理由（可空）：________','');
  fs.writeFileSync(path.join(output,'blind-key.json'),JSON.stringify(rows.map(r=>({scene:r.scene,rep:r.rep,A:r.A.arm,B:r.B.arm})),null,2));
  fs.writeFileSync(path.join(output,'call-metadata.json'),JSON.stringify(calls,null,2));
  fs.writeFileSync(path.join(output,'blind-ballot.md'),lines.join('\n'),'utf8');
  const summary={created:new Date().toISOString(),status:'exploratory_turn_hint_ablation_not_acceptance',provider:'deepseek-account',modelAlias:'deepseek-flash',checkpoint:'not exposed',reasoningEffort:'off',maxTokens:256,repetitions,candidatePairs:rows.length,modelCalls:metadata.length,errors:metadata.filter(c=>c.finishReason!=='stop'||c.error).length,qqMessages:0,hindsightReads:0,hindsightWrites:0,realMemoryIO:false,humanBlindEvaluation:false,notes:['Both arms use the same system-level Dialogue Engine policy and identical current-turn data. The treatment adds the deterministic closed-act contract as a dynamic system prompt section; no separate planning model call.','Scenarios are authored synthetic cases; no real chat or memory was used.','This pilot does not certify naturalness or dialogue quality.']};
  fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({...summary,output}));
  process.exit(0);
}
const engine=await import(pathToFileURL(path.resolve('dsh-hymemory-plugin/dialogue-engine/index.js')).href);
const adapter=await import(pathToFileURL(path.resolve('dsh-hymemory-plugin/dialogue-adapter.js')).href);
const codeHash=createHash('sha256').update(fs.readFileSync('dsh-hymemory-plugin/dialogue-engine/turn-analysis.js')).update(fs.readFileSync('dsh-hymemory-plugin/dialogue-engine/dialogue-policy.js')).digest('hex');
const token=fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('MEMORY_BRIDGE_TOKEN='))?.slice(20).trim();
if(!token)throw Error('Missing local authentication');
const health=await (await fetch('http://127.0.0.1:8766/health')).json();
if(health.provider!=='deepseek-account')throw Error('Required local model service is not ready');
const scenes=[
  {id:'technical-sharing',text:'我又把代码写炸了，笑死。',criteria:'分享挫败，不是排错委托。'},
  {id:'rhetorical-technical-sharing',text:'我真服了，这怎么又坏了？',criteria:'带问号的技术吐槽；除非明确求助，不要自动排错或追问。'},
  {id:'technical-help',text:'我又把代码写炸了，笑死，帮我看看是哪错了。',criteria:'明确求助，需要实际开始帮忙。'},
  {id:'explicit-factual-question',text:'这个报错是什么意思？',criteria:'明确事实提问，应直接解释，不附加习惯性反问。'},
  {id:'quoted-line-sharing',text:'这句台词真难受。',quotedText:'她想要的只是普通的明天。',criteria:'分享引用台词，应说直接感想，不做复述点评。'},
  {id:'daily-sharing',text:'今天忙了一整天，回家才发现晚饭也忘了吃。',criteria:'日常分享，没有请求建议。'},
];
const sharedSystem=`${engine.DEFAULT_STYLE}\n你是柚柚。使用自然、简洁的中文。工具操作仍遵守宿主权限，不能声称未完成的操作已完成。\n${engine.dialogueSystemPolicy('private')}`;
const identity={appId:'synthetic-app',scope:'c2c',peerId:'synthetic-person'};
function context(scene,withHint){
  const input={scope:'private',speaker:'当前发言者',text:scene.text,quoted:scene.quotedText?{speaker:'引用对象由平台上下文核验',text:scene.quotedText}:null};
  const prompt=adapter.nativeDialoguePrompt(identity,{text:scene.text,quotedText:scene.quotedText||''});
  const data=engine.compileDialogueTurn(input,{variant:'C',includeStyle:false}).data;
  return {system:withHint?sharedSystem+'\n'+engine.renderTurnPolicySection(prompt.policy):sharedSystem,
    user:'【本轮对话资料；原始消息与实际图片优先】\n'+JSON.stringify(data)};
}
const calls=[],rows=[];
async function generate(scene,rep,withHint){
  const started=performance.now(),arm=withHint?'module-act-hint-in-system':'shared-system-policy-only';
  const request=context(scene,withHint);
  const response=await fetch('http://127.0.0.1:8766/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:request.system},{role:'user',content:request.user}],max_tokens:256,reasoning_effort:'off'}),signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error('BridgeHTTP'+response.status);
  const body=await response.json(),choice=body.choices?.[0],text=choice?.message?.content||'';
  const item={scene:scene.id,rep,arm,elapsedMs:Math.round(performance.now()-started),usage:body.usage,finishReason:choice?.finish_reason,text};calls.push(item);
  if(choice?.finish_reason==='length')throw Error('ModelOutputTruncated');if(!text.trim())throw Error('EmptyModelOutput');return item;
}
for(const scene of scenes)for(let rep=1;rep<=repetitions;rep++){
  const flip=randomInt(2)===1,outcomes={};
  for(const withHint of (flip?[true,false]:[false,true])){
    const arm=withHint?'module-act-hint-in-system':'shared-system-policy-only';
    try{outcomes[arm]=await generate(scene,rep,withHint);}catch(error){outcomes[arm]={arm,text:'',error:error.name+':'+error.message};}
  }
  rows.push({scene:scene.id,rep,utterance:scene.text,quotedText:scene.quotedText||'',criteria:scene.criteria,
    A:outcomes[flip?'module-act-hint-in-system':'shared-system-policy-only'],B:outcomes[flip?'shared-system-policy-only':'module-act-hint-in-system']});
}
fs.writeFileSync(path.join(output,'blinded-candidates.jsonl'),rows.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');
fs.writeFileSync(path.join(output,'blind-key.json'),JSON.stringify(rows.map(r=>({scene:r.scene,rep:r.rep,A:r.A.arm,B:r.B.arm})),null,2));
fs.writeFileSync(path.join(output,'call-metadata.json'),JSON.stringify(calls.map(({text,...item})=>item),null,2));
const lines=['# 盲化回复比较表','','每组请选择：A更合适 / B更合适 / 两条都可以 / 两条都不行。重点看回复是否听懂当前话轮、有没有替对方决定要做什么、是否自然。短不自动代表好。',''];
for(const r of rows)lines.push(`## ${r.scene}（第${r.rep}次）`,'',`场景：${r.utterance}${r.quotedText?`\n引用内容：${r.quotedText}`:''}`,`观察点：${r.criteria}`,'',`**A**：${r.A.text||'（生成失败）'}`,'',`**B**：${r.B.text||'（生成失败）'}`,'','选择：________　简短理由（可空）：________','');
fs.writeFileSync(path.join(output,'blind-ballot.md'),lines.join('\n'),'utf8');
const summary={created:new Date().toISOString(),status:'exploratory_turn_hint_ablation_not_acceptance',provider:health.provider,modelAlias:health.model,checkpoint:'not exposed',reasoningEffort:'off',maxTokens:256,repetitions,candidatePairs:rows.length,modelCalls:calls.length,errors:calls.filter(c=>c.finishReason!=='stop').length,analysisSha256:codeHash,qqMessages:0,hindsightReads:0,hindsightWrites:0,realMemoryIO:false,humanBlindEvaluation:false,notes:['Both arms use the same system-level Dialogue Engine policy and identical current-turn data. The treatment adds the deterministic closed-act contract as a dynamic system prompt section; no separate planning model call.','Scenarios are authored synthetic cases; no real chat or memory was used.','This pilot does not certify naturalness or dialogue quality.']};
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,output}));
