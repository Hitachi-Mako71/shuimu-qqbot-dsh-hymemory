import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareInput, sessionKey, toolsForCodex} from '../dsh-chatgpt-plugin/native-protocol.js';
import {NativeEngine} from '../dsh-chatgpt-plugin/native-engine.js';
import {NativeRPC,writeJson} from '../dsh-chatgpt-plugin/native-rpc.js';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('only current user input is appended, context is separate',()=>{
 const result=prepareInput({system:'persona',messages:[{role:'user',id:'old',content:'old question'},{role:'assistant',content:'old answer'},{role:'user',source:{kind:'context',producer:'memory'},content:'memory snapshot'},{role:'user',id:'new',content:'hello'}]});
 assert.deepEqual(result.input,[{type:'text',text:'hello'}]);
 assert.match(result.context,/memory snapshot/);assert.doesNotMatch(result.context,/old question/);
});
test('same DSH session keeps native identity across model route changes',()=>{
 assert.equal(sessionKey('session-a'),sessionKey('session-a'));assert.notEqual(sessionKey('session-a'),sessionKey('session-b'));assert.equal(sessionKey(undefined),null);
});
test('tools retain reversible DSH names with valid native specs',()=>{
 const result=toolsForCodex([{name:'memory.search',description:'search',parameters:{type:'object',properties:{}}}]);
 assert.equal(result.specs[0].type,'function');assert.equal(result.names.get(result.specs[0].name),'memory.search');
});
test('QQ vision helper image request remains current input, never only context',()=>{
 const message={role:'user',source:{kind:'plugin',plugin:'dsh-im-qqbot'},content:[{type:'image',attachment:{id:'image-fixture'}},{type:'text',text:'读出表情包文字'}]};
 const result=prepareInput({messages:[message]});
 assert.equal(result.current.length,1);
 assert.deepEqual(result.input,[{type:'text',text:'读出表情包文字'}]);
 const scoped=prepareInput({sessionId:'real-qq-session',messages:[message]});
 assert.equal(scoped.current.length,0,'plugin context cannot become user evidence in a persistent chat');
});
class FakeRPC extends EventEmitter {
 constructor(){super();this.config={cwd:'C:/memory'};this.overrides={};this.calls=[];this.turn=0;this.thread=0;}
 async start(){}
 async call(method,params){this.calls.push({method,params});if(method==='thread/start')return{thread:{id:'thread-'+(++this.thread)}};if(method==='thread/resume')return{thread:{id:params.threadId}};if(method==='turn/start'){const turn={id:'turn-'+(++this.turn)};if(!this.hang)queueMicrotask(()=>{this.emit('event',{method:'item/completed',params:{threadId:params.threadId,item:{type:'agentMessage',phase:'final',text:'ok'}}});this.emit('event',{method:'turn/completed',params:{threadId:params.threadId,turn:{...turn,status:'completed'}}});});return{turn};}return{};}
 close(){}
}
const collect=async gen=>{let result=[];for await(const c of gen)result.push(c);return result;};
test('native vision helper transmits actual image bytes to Codex',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuzu-vision-'));
 try{
 const rpc=new FakeRPC(),engine=new NativeEngine(dir,rpc);let reads=0;
 const attachments={readImageRequest:async()=>{reads++;return{mediaType:'image/png',data:Buffer.from('fixture-image')};}};
 await collect(engine.stream({model:'gpt-6-luna',messages:[{role:'user',source:{kind:'plugin',plugin:'dsh-im-qqbot'},content:[{type:'image',attachment:{id:'owned-image'}},{type:'text',text:'Describe this image'}]}]},attachments));
 assert.equal(reads,1);assert.match(rpc.calls.find(c=>c.method==='turn/start').params.input.find(i=>i.type==='image').url,/^data:image\/png;base64,/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native thread is reused after process restart; identities stay separate',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuzu-native-'));
 try{
 const rpc=new FakeRPC(),engine=new NativeEngine(dir,rpc);
 const input=sessionId=>({sessionId,model:'gpt-6-luna',messages:[{role:'user',content:'hello'}]});
 await collect(engine.stream(input('a')));await collect(engine.stream(input('a')));await collect(engine.stream(input('b')));
 assert.equal(rpc.calls.filter(c=>c.method==='thread/start').length,2);
 const restart=new FakeRPC(),second=new NativeEngine(dir,restart);await collect(second.stream(input('a')));
 assert.equal(restart.calls[0].method,'thread/resume');assert.equal(restart.calls[0].params.threadId,'thread-1');
 assert.equal(restart.calls.find(c=>c.method==='turn/start').params.input.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('aborted QQ request interrupts its own Codex turn',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuzu-native-'));
 try{const rpc=new FakeRPC();rpc.hang=true;const engine=new NativeEngine(dir,rpc),controller=new AbortController();setTimeout(()=>controller.abort(),20);
 await assert.rejects(collect(engine.stream({sessionId:'a',model:'gpt-6-luna',messages:[{role:'user',content:'hi'}],signal:controller.signal})),/CODEX_CANCELLED/);
 assert.ok(rpc.calls.some(c=>c.method==='turn/interrupt'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

class OccupiedRPC extends FakeRPC {
 async call(method,params){
  if(method==='thread/resume'){
   this.calls.push({method,params});
   throw Object.assign(Error(this.rejectCode||'CODEX_THREAD_BUSY'),{rpcMethod:method,rpcCode:-32600});
  }
  if(method==='thread/turns/list'){this.calls.push({method,params});return{data:[{id:'previous-turn',status:this.sourceStatus||'completed'}]};}
  if(method==='thread/fork'){this.calls.push({method,params});return{thread:{id:'continued-thread',forkedFromId:params.threadId,ephemeral:false}};}
  return super.call(method,params);
 }
}
function occupiedFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuzu-native-busy-'));
 const original={threads:{[sessionKey('a')]:{threadId:'old-thread',title:'柚柚QQ · existing',cwd:'C:/memory'},[sessionKey('other')]:{threadId:'other-thread'}}};
 writeJson(path.join(dir,'threads.private.json'),original);
 return{dir,original,rpc:new OccupiedRPC(),options:{sessionId:'a',model:'gpt-5.6-luna',messages:[{role:'user',content:'private message must not enter diagnostics'}]}};
}
test('an occupied completed conversation continues its history once and reuses the replacement',async()=>{
 const f=occupiedFixture();try{
  const engine=new NativeEngine(f.dir,f.rpc);
  assert.ok((await collect(engine.stream(f.options))).some(p=>p.type==='text-delta'&&p.text==='ok'));
  await collect(engine.stream(f.options));
  const mapping=JSON.parse(fs.readFileSync(path.join(f.dir,'threads.private.json'),'utf8'));
  assert.equal(mapping.threads[sessionKey('a')].threadId,'continued-thread');
  assert.deepEqual(mapping.threads[sessionKey('a')].previousThreads,['old-thread']);
  assert.deepEqual(mapping.threads[sessionKey('other')],f.original.threads[sessionKey('other')]);
  assert.equal(f.rpc.calls.filter(c=>c.method==='thread/fork').length,1);
  assert.deepEqual(f.rpc.calls.filter(c=>c.method==='turn/start').map(c=>c.params.threadId),['continued-thread','continued-thread']);
  const runtime=JSON.parse(fs.readFileSync(path.join(f.dir,'runtime.json'),'utf8'));
  assert.equal(runtime.phase,'ready');assert.ok(runtime.lastRecovery.at);
  assert.doesNotMatch(JSON.stringify(runtime),/private message|old-thread|continued-thread/);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('recovery does not fork a source that is currently running',async()=>{
 for(const sourceStatus of ['inProgress','interrupted']){
 const f=occupiedFixture();f.rpc.sourceStatus=sourceStatus;try{
  await assert.rejects(collect(new NativeEngine(f.dir,f.rpc).stream(f.options)),/CODEX_THREAD_BUSY/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir,'threads.private.json'),'utf8')),f.original);
  assert.equal(f.rpc.calls.filter(c=>c.method==='thread/fork').length,0);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
 }
});
test('unrelated RPC failures preserve the mapping and expose safe method details',async()=>{
 const f=occupiedFixture();f.rpc.rejectCode='CODEX_RPC_ERROR';try{
  await assert.rejects(collect(new NativeEngine(f.dir,f.rpc).stream(f.options)),/CODEX_RPC_ERROR/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir,'threads.private.json'),'utf8')),f.original);
  assert.equal(f.rpc.calls.filter(c=>c.method==='thread/fork').length,0);
  const runtime=JSON.parse(fs.readFileSync(path.join(f.dir,'runtime.json'),'utf8'));
  assert.equal(runtime.phase,'error');assert.equal(runtime.lastFailure.method,'thread/resume');assert.equal(runtime.lastFailure.rpcCode,-32600);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('concurrent initialization of one QQ identity has one recovery',async()=>{
 const f=occupiedFixture();try{
  const engine=new NativeEngine(f.dir,f.rpc),states=await Promise.all([engine.state(f.options),engine.state(f.options)]);
  assert.equal(states[0],states[1]);assert.equal(f.rpc.calls.filter(c=>c.method==='thread/fork').length,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('real RPC framing classifies a writer conflict without exposing the server message',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuzu-native-wire-'));
 const rpc=new NativeRPC(dir);
 try{
  fs.writeFileSync(path.join(dir,'app-server'),`const readline=require('node:readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;const out=m.method==='thread/resume'?{error:{code:-32600,message:'thread 11111111-2222-3333-4444-555555555555 already has an active writer private-fixture-secret'}}:{result:{config:{},marketplaces:[]}};process.stdout.write(JSON.stringify({id:m.id,...out})+'\\n');});`);
  writeJson(path.join(dir,'config.json'),{codexPath:process.execPath,codexHome:dir,cwd:dir});
  await rpc.start();
  await assert.rejects(rpc.call('thread/resume',{threadId:'fixture'}),error=>{
   assert.equal(error.message,'CODEX_THREAD_BUSY');assert.equal(error.rpcMethod,'thread/resume');assert.equal(error.rpcCode,-32600);
   assert.doesNotMatch(JSON.stringify(error),/private-fixture-secret|11111111/);return true;
  });
 }finally{rpc.close();await new Promise(resolve=>rpc.child?.exitCode!==null?resolve():rpc.child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
