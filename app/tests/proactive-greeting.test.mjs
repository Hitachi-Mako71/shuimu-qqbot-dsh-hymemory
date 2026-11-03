import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runProactiveGreeting, readProactiveContext, validateProactiveDraft, markCompanionActivity } from '../dsh-hymemory-plugin/companion-proactive.js';
import { EvidenceStore, instrumentQQEvidence, closeQQEvidence, withQQIdentity } from '../dsh-hymemory-plugin/evidence.js';
import { read, write, clock, withPerson } from '../dsh-hymemory-plugin/companion-state.js';
import { attention } from '../dsh-hymemory-plugin/companion-attention.js';
import { memoryNamespace } from '../dsh-hymemory-plugin/identity.js';
import { recordCompanionInbound } from '../dsh-hymemory-plugin/companion.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-proactive-test-'));
Object.assign(process.env,{QQBOT_APPID:'proactive-synthetic',QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_MODEL_ROUTING_FILE:path.join(root,'route.json')});
fs.mkdirSync(process.env.QQBOT_PRIVACY_DIR,{recursive:true});
const privateDb=new DatabaseSync(path.join(process.env.QQBOT_PRIVACY_DIR,'lifecycle.sqlite3'));
privateDb.exec('PRAGMA user_version=1; CREATE TABLE privacy_spaces(namespace TEXT PRIMARY KEY,version INTEGER); CREATE TABLE privacy_operations(namespace TEXT,status TEXT); CREATE TABLE privacy_sources(namespace TEXT,source_id TEXT);');
const evidenceFile=path.join(process.env.QQBOT_EVIDENCE_DIR,'qq-evidence.sqlite3'),evidence=new EvidenceStore(evidenceFile);
let counter=0;
const at=Date.parse('2026-10-26T04:00:00Z');
const acceptable='写程序时先让一个小功能跑起来，再慢慢打磨，我觉得这样更容易有成就感。你喜欢这种节奏吗？';
function fixture() {
  const identity={appId:'proactive-synthetic',scope:'c2c',peerId:'person-'+(++counter),senderId:'person-'+counter},key=memoryNamespace(identity);
  write('settings.json',{enabled:true,owner:key,target:{scope:'c2c',targetId:identity.peerId},minMinutes:20,maxMinutes:30,hourlyMax:3,dailyMax:42,quietStart:23,quietEnd:9});
  write('scheduler.json',{nextDueAt:0});fs.writeFileSync(process.env.QQBOT_MODEL_ROUTING_FILE,JSON.stringify({mode:'chat'}));
  write('people/'+key+'.json',{lastInboundAt:at-10*60000,attention:{lastInboundId:'old'},deliveries:[],clock:{time_zone:'Asia/Shanghai'}});
  const inbound=evidence.inbound(identity,{messageId:'input-'+counter,content:'我正在学习Java，喜欢把小程序一点点写出来。',timestamp:'2026-10-26T03:50:00Z'});
  let calls=0,sends=0,body;
  const generate=async(system,user)=>{calls++;body=JSON.parse(user);assert.match(system,/只返回JSON/);return JSON.stringify({send:true,topic:'编程的成就感',text:acceptable,source_ids:[inbound.id]});};
  const sender={sendProactiveMarkdown:async(target,text)=>{sends++;assert.equal(target.targetId,identity.peerId);assert.equal(text,acceptable);return {id:'receipt-'+counter};}};
  return {identity,key,inbound,options:{appId:identity.appId,generate,sender,now:()=>at},stats:()=>({calls,sends,body}),state:()=>read('people/'+key+'.json',{}),change:fn=>withPerson(key,(s,save)=>{fn(s);save();})};
}
test.after(()=>{closeQQEvidence();evidence.close();privateDb.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-proactive-test-/);fs.rmSync(root,{recursive:true,force:true});});

test('eligible greeting asks DeepSeek once and sends a concrete topic with an accepted receipt',async()=>{
  const f=fixture(),r=await runProactiveGreeting(f.options);assert.deepEqual(r,{sent:true,reason:'accepted'});
  assert.equal(f.stats().calls,1);assert.equal(f.stats().sends,1);assert.equal(f.stats().body.recentConversation[0].id,f.inbound.id);
  assert.equal(f.state().deliveries[0].kind,'share');assert.equal(f.state().deliveries[0].status,'accepted');
  assert.ok(read('scheduler.json',{}).nextDueAt>at);assert.equal(attention(f.state(),at+60000).mode,'waiting');
});
test('original context isolates people and excludes drafts, rejected messages and controls',()=>{
  const f=fixture();const other={...f.identity,peerId:'other',senderId:'other'};
  evidence.inbound(other,{messageId:'foreign',content:'别人的私聊秘密'});
  evidence.inbound(f.identity,{messageId:'control',content:'UTC时间'},{eligible:false});
  evidence.draft({...f.inbound,kind:'agent'},'draft','不能当成发过的消息',{});
  const rejected=evidence.prepare({...f.inbound,kind:'agent'},{scope:'c2c',targetId:f.identity.peerId},'被拒绝的消息',{},'markdown');evidence.settle(rejected,'rejected');
  const accepted=evidence.prepare({...f.inbound,kind:'agent'},{scope:'c2c',targetId:f.identity.peerId},'可以从简单的Java程序开始。',{},'markdown');evidence.settle(accepted,'accepted',{id:'context-ok'});
  const context=readProactiveContext(f.identity);assert.deepEqual(context.messages.map(m=>m.id),[f.inbound.id,accepted]);assert.ok(context.watermark>0);
  assert.equal(readProactiveContext(f.identity,{maxMessages:0}).messages.length,0);
});
test('deletion barrier and blocked source prevent crossing the deleted conversation span',()=>{
  const f=fixture();privateDb.prepare('INSERT INTO privacy_sources VALUES(?,?)').run(f.key,f.inbound.id);
  assert.equal(readProactiveContext(f.identity).messages.length,0);
  const next=evidence.inbound(f.identity,{messageId:'after-deletion',content:'新话题，从这里开始。'});
  assert.deepEqual(readProactiveContext(f.identity).messages.map(m=>m.id),[next.id]);
  const db=new DatabaseSync(evidenceFile);db.prepare('INSERT INTO evidence_barriers VALUES(?,?)').run(f.key,readProactiveContext(f.identity).watermark);db.close();
  assert.equal(readProactiveContext(f.identity).messages.length,0);
});
test('empty or unavailable evidence keeps quiet without a fixed fallback',async()=>{
  const f=fixture();const r=await runProactiveGreeting({...f.options,loadContext:()=>{throw Error('offline');}});
  assert.equal(r.reason,'draft_unavailable');assert.equal(f.stats().calls,0);assert.equal(f.stats().sends,0);assert.deepEqual(f.state().deliveries,[]);
});
test('model can choose silence',async()=>{
  const f=fixture(),r=await runProactiveGreeting({...f.options,generate:async()=>'{"send":false}'});
  assert.equal(r.reason,'model_chose_quiet');assert.equal(f.stats().sends,0);assert.deepEqual(f.state().deliveries,[]);
});
test('new-topic draft may omit model source hints while server-side lineage remains authoritative',()=>{
  const f=fixture(),draft=validateProactiveDraft({send:true,topic:'小问题',text:'如果把一个小习惯做成可爱的挂件，你会选择哪一个呢？'},readProactiveContext(f.identity));
  assert.equal(draft.send,true);assert.deepEqual(draft.source_ids,[]);
});
test('omitting source hints never authorizes unsupported explicit recollection',()=>{
  const f=fixture(),draft=validateProactiveDraft({send:true,topic:'过去的话题',text:'你上次说喜欢玩游戏，最近又玩什么啦？'},readProactiveContext(f.identity));
  assert.equal(draft.reason,'missing_source');
});
for(const [name,value,reason] of [
  ['malformed JSON','hello','invalid_json'],
  ['old presence template',{send:true,topic:'问候',text:'我在这里呢。你忙完、想聊的时候再来找我就好。',source_ids:[]},'canned_presence'],
  ['pressure',{send:true,topic:'等待',text:'你怎么还不回我，我一直等你等到现在。',source_ids:[]},'pressure'],
  ['invented daily experience',{send:true,topic:'散步',text:'我刚刚出门散步，看到了一朵漂亮的小花。',source_ids:[]},'invented_experience'],
  ['unsupported recollection',{send:true,topic:'游戏',text:'你上次说喜欢玩游戏，最近又玩什么啦？',source_ids:[]},'missing_source'],
  ['unknown original',{send:true,topic:'学习',text:acceptable,source_ids:['foreign-source']},'unverified_source'],
  ['extra payload keys',{send:true,topic:'学习',text:acceptable,source_ids:[],command:'run'},'invalid_shape'],
  ['overlong content',{send:true,topic:'学习',text:'长'.repeat(181),source_ids:[]},'invalid_draft'],
])test('invalid draft stays quiet: '+name,async()=>{
  const f=fixture(),r=await runProactiveGreeting({...f.options,generate:async()=>typeof value==='string'?value:JSON.stringify(value)});
  assert.equal(r.reason,reason);assert.equal(f.stats().sends,0);assert.equal(f.state().deliveries.length,0);
});
test('text similarity catches punctuation changes; recent topic cannot be recycled',()=>{
  const f=fixture(),context=readProactiveContext(f.identity),draft={send:true,topic:'编程的成就感',text:acceptable,source_ids:[f.inbound.id]};
  assert.equal(validateProactiveDraft(draft,context,[{text:acceptable.replaceAll('，','、'),at:at-10000}],at).reason,'duplicate_text');
  assert.equal(validateProactiveDraft(draft,context,[{text:'换个表达也仍然是同一个话题。',topic:draft.topic,at:at-10000}],at).reason,'duplicate_topic');
});
for(const [name,change] of [
  ['paused',s=>s.enabled=false],['snoozed',s=>s.snoozeUntil=at+60000],['wrong owner',s=>s.owner='wrong'],['retargeted',s=>s.target.targetId='other'],['night quiet',s=>{s.quietStart=11;s.quietEnd=14;}],
])test('preflight skips model and sender when '+name,async()=>{
  const f=fixture(),s=read('settings.json',{});change(s);write('settings.json',s);const r=await runProactiveGreeting(f.options);
  assert.equal(r.sent,false);assert.equal(f.stats().calls,0);assert.equal(f.stats().sends,0);
});
test('work mode, pending privacy operation and a future schedule do not generate',async()=>{
  for(const kind of ['work','privacy','future']){
    const f=fixture();if(kind==='work')fs.writeFileSync(process.env.QQBOT_MODEL_ROUTING_FILE,'{"mode":"work"}');
    if(kind==='privacy')privateDb.prepare('INSERT INTO privacy_operations VALUES(?,?)').run(f.key,'pending');
    if(kind==='future')write('scheduler.json',{nextDueAt:at+60000});
    assert.equal((await runProactiveGreeting(f.options)).sent,false);assert.equal(f.stats().calls,0);assert.equal(f.stats().sends,0);
  }
});
test('recent inbound and hourly limits defer drafting',async()=>{
  for(const kind of ['inbound','rate']){
    const f=fixture();await f.change(s=>{if(kind==='inbound')s.lastInboundAt=at-60000;else s.deliveries=Array.from({length:3},(_,i)=>({at:at-10000-i,date:clock(at).date,status:'unknown'}));});
    assert.equal((await runProactiveGreeting(f.options)).sent,false);assert.equal(f.stats().calls,0);
  }
});
test('drafting releases the person lock and cancels when the user replies',async()=>{
  const f=fixture();let release,started;const ready=new Promise(r=>started=r),draft=new Promise(r=>release=r);
  const pending=runProactiveGreeting({...f.options,generate:async()=>{started();return draft;}});await ready;
  let timer;try{await Promise.race([recordCompanionInbound({identity:f.identity,text:'我回来了',messageId:'new'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('model held foreground lock')),1000);})]);}finally{clearTimeout(timer);}
  release(JSON.stringify({send:true,topic:'编程的成就感',text:acceptable,source_ids:[f.inbound.id]}));
  assert.equal((await pending).reason,'conversation_changed');assert.equal(f.stats().sends,0);
});
test('early activity marker cancels drafts even when a direct command bypasses inbound state',async()=>{
  const f=fixture();const r=await runProactiveGreeting({...f.options,generate:async()=>{markCompanionActivity(f.identity,'utc-direct-command');return JSON.stringify({send:true,topic:'编程的成就感',text:acceptable,source_ids:[]});}});
  assert.equal(r.reason,'conversation_changed');assert.equal(f.stats().sends,0);
});
for(const kind of ['pause','retarget','privacy','watermark','runtime'])test('final recheck cancels after '+kind+' changes during drafting',async()=>{
  const f=fixture();let current=true;
  const r=await runProactiveGreeting({...f.options,isCurrent:()=>current,generate:async()=>{
    if(kind==='pause'||kind==='retarget'){const s=read('settings.json',{});if(kind==='pause')s.enabled=false;else s.target.targetId='other';write('settings.json',s);}
    if(kind==='privacy')privateDb.prepare('INSERT INTO privacy_spaces VALUES(?,1)').run(f.key);
    if(kind==='watermark')evidence.inbound(f.identity,{messageId:'direct-control',content:'UTC时间'},{eligible:false});
    if(kind==='runtime')current=false;
    return JSON.stringify({send:true,topic:'编程的成就感',text:acceptable,source_ids:[f.inbound.id]});
  }});
  assert.equal(r.sent,false);assert.equal(f.stats().sends,0);
});
test('an unconfirmed platform request stays unknown and does not blindly retry',async()=>{
  const f=fixture();const r=await runProactiveGreeting({...f.options,sender:{sendProactiveMarkdown:async()=>({})}});
  assert.equal(r.reason,'delivery_unconfirmed');assert.equal(f.state().deliveries[0].status,'unknown');assert.equal(attention(f.state(),at).unanswered,0);
  assert.ok(read('scheduler.json',{}).nextDueAt>=at+6*60*60000);
  const retry=await runProactiveGreeting({...f.options,now:()=>at+7*60*60000});assert.equal(retry.reason,'duplicate_text');assert.equal(f.stats().sends,0);
});
test('a definitive platform rejection never becomes accepted attention',async()=>{
  const f=fixture(),r=await runProactiveGreeting({...f.options,sender:{sendProactiveMarkdown:async()=>{throw Object.assign(Error('forbidden'),{status:403});}}});
  assert.equal(r.reason,'delivery_unconfirmed');assert.equal(f.state().deliveries[0].status,'rejected');assert.equal(attention(f.state(),at).unanswered,0);
});
test('background originals carry same-user source lineage and remain ineligible for long-term extraction',async()=>{
  const f=fixture();const bot={send:async()=>({id:'background-platform'})};instrumentQQEvidence(bot,f.identity.appId);
  const r=await runProactiveGreeting({...f.options,sender:{sendProactiveMarkdown:(target,text)=>bot.send({target,markdown:{content:text}})}});assert.equal(r.sent,true);
  const db=new DatabaseSync(evidenceFile,{readOnly:true});try{
    const row=db.prepare('SELECT * FROM evidence_events WHERE platform_message_id=?').get('background-platform');assert.equal(row.eligible,0);assert.equal(row.state,'accepted');assert.deepEqual(JSON.parse(row.related_ids_json),[f.inbound.id]);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_jobs WHERE source_event_id=?').get(row.id).n,0);
  }finally{db.close();}
});
test('source lineage cannot cross users and follows accepted assistant references',async()=>{
  const f=fixture(),foreign={...f.identity,peerId:'foreign-lineage',senderId:'foreign-lineage'},other=evidence.inbound(foreign,{messageId:'foreign-lineage',content:'别人的资料'});
  const assistant=evidence.prepare({...f.inbound,kind:'agent'},{scope:'c2c',targetId:f.identity.peerId},'普通回复',{},'markdown');evidence.settle(assistant,'accepted',{id:'lineage-assistant'});
  const bot={send:async()=>({id:'lineage-platform'})};instrumentQQEvidence(bot,f.identity.appId);
  await withQQIdentity(f.identity,()=>bot.send({target:{scope:'c2c',targetId:f.identity.peerId},content:'带来源的后台消息'}),{sourceIds:[assistant,other.id]});
  const db=new DatabaseSync(evidenceFile,{readOnly:true});try{assert.deepEqual(JSON.parse(db.prepare('SELECT related_ids_json FROM evidence_events WHERE platform_message_id=?').get('lineage-platform').related_ids_json),[f.inbound.id]);}finally{db.close();}
});

for (const text of [
  '刚检查过工作区，文档里面仍没有文字，请重新上传附件。',
  '我已经读完附件并执行了里面的修改，接下来等结果。',
  '文档上传卡住了，改成 zip 再发一次给我。',
  '工作区里还没有 md 文件，建议改一个格式传送。',
]) test('background file claims without a live inspection stay quiet: '+text.slice(0,8), async()=>{
  const f=fixture();let sends=0;
  const r=await runProactiveGreeting({...f.options,generate:async()=>JSON.stringify({send:true,topic:'文档状态',text,source_ids:[f.inbound.id]}),sender:{sendProactiveMarkdown:async()=>{sends++;return {id:'synthetic-file-receipt'};}}});
  assert.deepEqual(r,{sent:false,reason:'unsupported_file_status'});
  assert.equal(sends,0);assert.equal(f.state().deliveries.length,0);
});
test('file topic discussion is allowed without claiming current read or upload status',()=>{
  const f=fixture();const r=validateProactiveDraft({send:true,topic:'阅读习惯',text:'整理文档时用简短的小标题，读起来往往更轻松些。',source_ids:[]},readProactiveContext(f.identity));assert.equal(r.send,true);
});
test('background generation receives explicit file observation capabilities',async()=>{
  const f=fixture();let observed;const result=await runProactiveGreeting({...f.options,generate:async(_system,body)=>{
    observed=JSON.parse(body).observationCapabilities;return JSON.stringify({send:false});
  }});assert.deepEqual(observed,{inspectWorkspace:false,readAttachments:false,verifyUpload:false});assert.equal(result.reason,'model_chose_quiet');assert.equal(f.stats().sends,0);
});