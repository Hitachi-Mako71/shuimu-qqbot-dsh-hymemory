import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {recallConversation} from '../dsh-hymemory-plugin/conversation-policy.js';
import {historyTurn} from '../dsh-hymemory-plugin/history.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-demand-memory-'));
Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_METRICS_DIR:path.join(root,'metrics'),QQBOT_WORKSPACE_ROOT:path.join(root,'workspaces')});
fs.mkdirSync(process.env.QQBOT_COMPANION_DIR,{recursive:true});
fs.writeFileSync(path.join(process.env.QQBOT_COMPANION_DIR,'conversation-policy.json'),JSON.stringify({enabled:true}));
test.after(async()=>{const {closeQQEvidence}=await import('../dsh-hymemory-plugin/evidence.js');closeQQEvidence();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-demand-memory-/);fs.rmSync(root,{recursive:true,force:true});});
const identity={appId:'on-demand-check',scope:'c2c',peerId:'person',senderId:'person'};
test('default normal turns perform no upfront semantic lookup even with history and preference hints',async()=>{
 for(const input of ['柚柚，你有点高冷','我喜欢什么颜色','之前那个问题','我不知道什么意思']){
  let calls=0;const r=await recallConversation({identity,input,base:{},request:async()=>{calls++;return {memories:[]};}});
  assert.equal(calls,0,input);assert.deepEqual(r,{memories:[],sourceIds:[],context:''});
 }
});
test('default history hints do not create a history-only round before the model decides it lacks information',async()=>{
 let calls=0;const r=await historyTurn({input:'你还记得上次我们说过什么吗',base:{},request:async()=>{calls++;return {sources:[]};}});
 assert.equal(calls,0);assert.equal(r,null);
});
test('explicit user memory/history commands remain executable',async()=>{
 let endpoint;const r=await historyTurn({input:'查历史：颜色',base:{},request:async e=>{endpoint=e;return {sources:[]};}});
 assert.equal(endpoint,'/history/search');assert.equal(r.handled,true);
});

async function fixture(){
 const {EvidenceStore}=await import('../dsh-hymemory-plugin/evidence.js');
 const {memoryNamespace}=await import('../dsh-hymemory-plugin/identity.js');
 const {qqWorkspace}=await import('../dsh-hymemory-plugin/workspace.js');
 const seed=new EvidenceStore(path.join(process.env.QQBOT_EVIDENCE_DIR,'qq-evidence.sqlite3'));
 const previous=seed.inbound(identity,{messageId:'past-colour',content:'我喜欢蓝色'});
 const current=seed.inbound(identity,{messageId:'current-colour',content:'我喜欢什么颜色'});seed.close();
 const context={identity,namespace:memoryNamespace(identity),kind:'agent',inboundIds:[current.id],turnInboundIds:[current.id],privacyVersion:0};
 const cwd=qqWorkspace(identity),agent={[Symbol.for('qqbot.identity')]:identity,[Symbol.for('qqbot.evidence')]:context,ctx:{get:()=>({get:()=>cwd})},session:{}};
 return {previous,current,context,agent,exec:{agent,arguments:{query:'我喜欢什么颜色',reason:'unknown_personal_fact'},signal:new AbortController().signal}};
}

test('a model-declared knowledge gap can query with trusted identity and attach verified sources only to its current turn',async()=>{
 const {recallUnknownMemory}=await import('../dsh-hymemory-plugin/memory-recall-tool.js');
 const {memoryNamespace}=await import('../dsh-hymemory-plugin/identity.js');
 const f=await fixture(),saved=globalThis.fetch,calls=[];process.env.MEMORY_BRIDGE_TOKEN='synthetic-demand-only';
 globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);calls.push([new URL(url).pathname,payload]);assert.deepEqual(payload.identity,identity);assert.equal(payload.user_id,memoryNamespace(identity));return Response.json({ok:true,...(String(url).endsWith('/search')?{memories:[{id:'m1',content:'喜欢蓝色',meta:{evidence:{sources:[{id:f.previous.id,role:'user'}]}}}]}:{sources:[{id:f.previous.id,role:'user',text:'我喜欢蓝色',complete:true}]})});};
 try{const r=await recallUnknownMemory(f.exec);assert.equal(r.status,'found');assert.match(JSON.stringify(r),/蓝色/);assert.deepEqual(calls.map(c=>c[0]),['/search','/history/sources']);assert.ok(f.context.inboundIds.includes(f.previous.id));assert.deepEqual(f.context.turnInboundIds,[f.current.id]);await recallUnknownMemory(f.exec);assert.equal(calls.length,2,'same-turn duplicate uses the verified cached result');}
 finally{globalThis.fetch=saved;}
});

test('the memory tool rejects public/invalid reasons, forged identities and historical read-only turns without network I/O',async()=>{
 const {recallUnknownMemory}=await import('../dsh-hymemory-plugin/memory-recall-tool.js');const f=await fixture(),saved=globalThis.fetch;globalThis.fetch=()=>assert.fail('denied lookup must not request memory');
 try{
  for(const args of [{query:'today news',reason:'unknown_public_fact'},{query:'x',reason:'unknown_personal_fact',user_id:'foreign'},{query:'',reason:'unknown_personal_fact'}])await assert.rejects(recallUnknownMemory({...f.exec,arguments:args}),{code:'MEMORY_LOOKUP_ARGUMENTS_INVALID'});
  await assert.rejects(recallUnknownMemory({...f.exec,agent:{...f.agent,[Symbol.for('qqbot.history.readonly')]:true}}),{code:'MEMORY_LOOKUP_NOT_ALLOWED'});
  await assert.rejects(recallUnknownMemory({...f.exec,agent:{...f.agent,[Symbol.for('qqbot.identity')]:{...identity,peerId:'another-person',senderId:'another-person'}}}),{code:'MEMORY_LOOKUP_NOT_ALLOWED'});
 }finally{globalThis.fetch=saved;}
});

test('empty results remain honest, per-turn lookups are bounded, and a new round resets the budget',async()=>{
 const {recallUnknownMemory}=await import('../dsh-hymemory-plugin/memory-recall-tool.js');const f=await fixture(),saved=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:true,memories:[]});};
 try{assert.equal((await recallUnknownMemory(f.exec)).status,'empty');await recallUnknownMemory({...f.exec,arguments:{query:'另一个过往信息',reason:'unknown_personal_fact'}});await assert.rejects(recallUnknownMemory({...f.exec,arguments:{query:'第三个信息',reason:'unknown_personal_fact'}}),{code:'MEMORY_LOOKUP_TURN_LIMIT'});assert.equal(calls,2);const next=await fixture();assert.equal((await recallUnknownMemory(next.exec)).status,'empty');assert.equal(calls,3);}
 finally{globalThis.fetch=saved;}
});

test('late memory results cannot mutate the next turn or add old sources',async()=>{
 const {recallUnknownMemory}=await import('../dsh-hymemory-plugin/memory-recall-tool.js');const f=await fixture(),saved=globalThis.fetch;let release;globalThis.fetch=async()=>new Promise(resolve=>{release=()=>resolve(Response.json({ok:true,memories:[]}));});
 try{const pending=recallUnknownMemory(f.exec);await new Promise(resolve=>setImmediate(resolve));f.agent[Symbol.for('qqbot.evidence')]={...f.context,inboundIds:[]};release();await assert.rejects(pending,{code:'MEMORY_LOOKUP_STALE_TURN'});assert.deepEqual(f.agent[Symbol.for('qqbot.evidence')].inboundIds,[]);}
 finally{globalThis.fetch=saved;}
});

test('real native tool registration dispatches an on-demand lookup through the original tool guard',async()=>{
 const {Context}=await import('file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/cordis/lib/index.js');
 const {ToolRuntime}=await import('file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js');
 const {installQQMemoryRecall}=await import('../dsh-hymemory-plugin/memory-recall-tool.js');const {qqToolDenial}=await import('../dsh-hymemory-plugin/workspace.js');
 const f=await fixture(),saved=globalThis.fetch;globalThis.fetch=async()=>Response.json({ok:true,memories:[]});
 const ctx=new Context();ctx.provide('systemPrompt',{tools(){},section(){},getSectionOrder(){return 495;}});ctx.provide('workingDirectory',{get:()=>root});
 const tools=new ToolRuntime(ctx);tools.guard(qqToolDenial);installQQMemoryRecall(ctx);
 try{const r=await tools.execute({callId:'synthetic-memory-lookup',name:'qqbot_recall_memory',arguments:f.exec.arguments,agent:f.agent,signal:f.exec.signal});assert.equal(r.isError,false,JSON.stringify(r.error));assert.equal(JSON.parse(r.content[0].text).status,'empty');}
 finally{globalThis.fetch=saved;}
});
