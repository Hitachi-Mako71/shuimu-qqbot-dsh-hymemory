import {DEFAULT_STYLE} from '../dsh-hymemory-plugin/dialogue-engine/style-persona.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {write} from '../dsh-hymemory-plugin/companion-state.js';
import {recallConversation,recallNeeded,groupSchedule,groupWindow,dialogueContext} from '../dsh-hymemory-plugin/conversation-policy.js';
import {dialogueSystemPolicy} from '../dsh-hymemory-plugin/dialogue-engine/index.js';
import {groupParticipationGate,registerGroupParticipation} from '../dsh-hymemory-plugin/group-participation.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qq-policy-test-'));
process.env.QQBOT_COMPANION_DIR=path.join(temp,'companion');
let dispose;registerGroupParticipation({effect:fn=>{dispose=fn();}});
test.after(()=>{dispose();assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));assert.match(path.basename(temp),/^qq-policy-test-/);fs.rmSync(temp,{force:true,recursive:true});});
write('conversation-policy.json',{enabled:true});
const identity={appId:'policy-test',scope:'c2c',peerId:'user-a'},base={message_id:'current'};
const m=(content,id='memory1',source='s1')=>({id,content,meta:source?{evidence:{sources:[{id:source}]}}:{}});
test('standalone social acknowledgements skip recall; short meaningful queries still retrieve',()=>{
 assert.equal(recallNeeded('你好呀！'),false);assert.equal(recallNeeded('我喜欢什么'),true);assert.equal(recallNeeded('Java'),true);assert.equal(recallNeeded('你好，记得我的偏好吗'),true);
});
test('a standalone return greeting skips recall but explicit history references retain it',()=>{
 assert.equal(recallNeeded('我回来了'),false);assert.equal(recallNeeded('回来了～'),false);
 assert.equal(recallNeeded('我回来了，之前那个文件继续弄吧'),true);assert.equal(recallNeeded('我回来之前说的偏好是什么'),true);
});
test('independent public and local tasks skip recall while personal-history requests retain it',async()=>{
 const skip=['今天北京天气如何？','帮我把这句话翻译成英文：早上好','离线回答：smoke test 是什么','搜索今天英超比分'];
 for(const input of skip){assert.equal(recallNeeded(input),false,input);const r=await recallConversation({identity,base,input,request:()=>{throw Error('unexpected request');}});assert.deepEqual(r.memories,[],input);}
 assert.equal(recallNeeded('我喜欢什么颜色'),true);
 assert.equal(recallNeeded('按我之前说过的颜色偏好推荐一部电影'),true);
 assert.equal(recallNeeded('不要联网，按我之前说过的颜色偏好推荐一部电影'),true);
});
test('social acknowledgement performs no memory request',async()=>{
 const r=await recallConversation({identity,base,input:'谢谢',request:()=>{throw Error('unexpected request');}});assert.deepEqual(r.memories,[]);
});
test('a standalone return greeting performs no memory request',async()=>{
 const r=await recallConversation({identity,base,input:'我回来了',request:()=>{throw Error('unexpected request');}});assert.deepEqual(r.memories,[]);
});
test('recall deduplicates facts, rejects ungrounded legacy, and expands only original pointers',async()=>{
 const calls=[];const request=async(endpoint,body)=>{calls.push([endpoint,body]);return endpoint==='/search'?{memories:[m('喜欢蓝色'),m('喜欢 蓝色','m2'),m('旧摘要','m3',null)]}:{sources:[{id:'s1',role:'user',time:'2026-10-20',text:'我喜欢蓝色',complete:true},{id:'foreign',text:'other-user-secret'}]};};
 const r=await recallConversation({identity,base,input:'我喜欢什么颜色',request,onDemand:true});assert.equal(r.memories.length,1);assert.equal(calls.length,2);assert.deepEqual(calls[1][1].source_ids,['s1']);assert.match(r.context,/我喜欢蓝色/);assert.doesNotMatch(r.context,/other-user-secret/);assert.deepEqual(r.sourceIds,['s1']);
});
test('failed source expansion explicitly prevents pretending a verified quote',async()=>{
 const r=await recallConversation({identity,base,input:'我的颜色偏好',onDemand:true,request:async e=>{if(e==='/search')return {memories:[m('喜欢蓝色')]};throw Error('deleted or offline');}});assert.match(r.context,/暂不可核对/);assert.match(r.context,/不要逐字引用/);
});
test('source expansion and assembled evidence have finite independent budgets',async()=>{
 const r=await recallConversation({identity,base,input:'偏好',onDemand:true,request:async e=>e==='/search'?{memories:Array.from({length:10},(_,i)=>m('记忆'+i+'色'.repeat(1500),'m'+i,'s'+i))}:{sources:Array.from({length:3},(_,i)=>({id:'s'+i,text:'原'.repeat(2000),complete:true}))}});
 assert.ok(r.memories.reduce((n,m)=>n+m.content.length,0)<=4800);assert.ok(r.context.length<3000);assert.match(r.context,/"complete":false/);
});
test('private strategy preserves identity without repeated parent address or invented experiences',()=>{assert.match(DEFAULT_STYLE,/不要每句称呼爸爸妈妈/);const direct=dialogueContext(identity),group=dialogueContext({...identity,scope:'group',senderId:'member-a'});assert.equal(direct.policy.act,'respond');assert.match(direct.context,/"scope":"private"/);assert.match(group.context,/"scope":"group"/);assert.match(dialogueSystemPolicy('private'),/新更正优先/);assert.match(dialogueSystemPolicy('group'),/只用本群资料/);});
test('adaptive scheduler yields when the bot already exceeds its participant share',()=>{
 const now=Date.now(),room={messages:[{kind:'human',sender:'a',at:now},{kind:'human',sender:'b',at:now},{kind:'bot',at:now}]};
 const r=groupSchedule({conversationPolicy:'adaptive',frequency:'正常'},room,now);assert.equal(r.allow,false);assert.equal(r.gap,45000);
 room.messages.push(...Array.from({length:5},()=>({kind:'human',sender:'a',at:now})));assert.equal(groupSchedule({conversationPolicy:'adaptive'},room,now).allow,true);
});
test('fixed adaptive observation window is bounded; legacy keeps its former window',()=>{
 const room={messages:Array.from({length:100},()=>({kind:'human',at:Date.now()}))};assert.equal(groupWindow({conversationPolicy:'adaptive'},room),6000);assert.equal(groupWindow({},room),800);
});
test('adaptive active ordinary message is observed; explicit mention retains the normal pipeline',async()=>{
 const id={appId:'policy-test',scope:'group',peerId:'group-a',senderId:'member-a'},key=memoryNamespace(id);
 write('groups/registry.json',{rooms:{[key]:{enabled:true,frequency:'活跃',conversationPolicy:'adaptive',controller:'owner',allMessages:0,atMessages:0}}});
 const ctx={message:{kind:'group',content:'这个主意挺有意思',messageId:'msg-a',groupOpenid:id.peerId,senderId:id.senderId,rawEventType:'GROUP_MESSAGE_CREATE'},state:{mention:{}},bot:{},replyTarget:{scope:'group',targetId:id.peerId,msgId:'msg-a'}};
 let routed=0;await groupParticipationGate(ctx,async()=>routed++,id.appId);assert.equal(routed,0);
 ctx.state.mention.wasMentioned=true;ctx.message.messageId='msg-b';await groupParticipationGate(ctx,async()=>routed++,id.appId);assert.equal(routed,1);
});
