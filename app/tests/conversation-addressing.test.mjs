import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {replyEligibility,noteDirectReply} from '../dsh-hymemory-plugin/turn-strategy.js';
import {groupParticipationGate,registerGroupParticipation} from '../dsh-hymemory-plugin/group-participation.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';
import {read,write} from '../dsh-hymemory-plugin/companion-state.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-address-test-'));
Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_METRICS_DIR:path.join(root,'metrics'),QQBOT_APPID:'address-test'});
write('conversation-policy.json',{enabled:true});
let dispose;registerGroupParticipation({effect:fn=>{dispose=fn();}});
test.after(()=>{dispose();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-address-test-/);fs.rmSync(root,{recursive:true,force:true});});
let seq=0;
function fixture(text,options={}){
 const identity={appId:'address-test',scope:'group',peerId:'group-'+(++seq),senderId:'member-a'},key=memoryNamespace(identity),now=Date.now();
 const state=read('groups/registry.json',{rooms:{}});
 state.rooms[key]={enabled:options.enabled!==false,controller:'owner',frequency:'活跃',conversationPolicy:'adaptive',allMessages:0,atMessages:0,lastReplyAt:now,...options.row};write('groups/registry.json',state);
 const room={messages:[],deliveries:[],lastJudgedAt:now,newMessages:0,lastAmbient:{id:'old-proactive',at:now,topic:['更新'],status:'accepted',acknowledged:false,unansweredCount:1},...options.room};write('groups/rooms/'+key+'.json',room);
 const ctx={message:{kind:'group',groupOpenid:identity.peerId,senderId:identity.senderId,messageId:'synthetic-'+seq,content:text,rawEventType:'GROUP_MESSAGE_CREATE',attachments:[],...options.message},state:{mention:{},qqEvidence:{identity,namespace:key,inboundIds:[],privacyVersion:0}},bot:{sendMarkdown:()=>{throw Error('No manual QQ sends in routing tests');}},replyTarget:{scope:'group',targetId:identity.peerId,msgId:'synthetic-'+seq}};
 let routed=0;return {identity,key,ctx,next:async()=>{routed++;},count:()=>routed};
}

for(const text of ['你今天又更新了','你今天有更新了','你现在是什么版本','哎呦，不理我','为什么没接上','你怎么不回我','理理我','回我一下'])test('adaptive routing responds to explicit conversational address: '+text,async()=>{
 const f=fixture(text);await groupParticipationGate(f.ctx,f.next,f.identity.appId);
 assert.equal(f.count(),1);assert.equal(f.ctx.state.qqEvidence.groupDirected,true);
 assert.equal(read('groups/registry.json',{}).rooms[f.key].frequency,'活跃');
 assert.equal(read('groups/registry.json',{}).rooms[f.key].conversationPolicy,'adaptive');
 assert.equal(read('groups/rooms/'+f.key+'.json',{}).lastAmbient.acknowledged,true);
});

for(const text of ['猜猜更新功能还是debug','还有五天才重置但是周额度只有40%了','可惜','为什么没接上','那你觉得呢'])test('same-author recent follow-up does not require a question mark or copied keywords: '+text,async()=>{
 const f=fixture(text,{room:{directThread:{sender:'member-a',at:Date.now()-1000,topic:['额度'],depth:0,receiptId:'accepted-reply'}}});
 await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);
});

test('a real accepted ambient reply establishes a same-author thread',()=>{
 const f=fixture('合成消息');noteDirectReply({identity:f.identity,kind:'group',eligible:true},'额度还剩四成，可以安排一下。','accepted-ambient');
 const room=read('groups/rooms/'+f.key+'.json',{});assert.equal(room.directThread?.sender,'member-a');assert.equal(room.directThread?.receiptId,'accepted-ambient');
 assert.equal(room.messages.filter(m=>m.id==='accepted-ambient').length,1);
});
test('accepted agent reply is present once in short group context without needing an explicit-at flag',()=>{
 const f=fixture('合成消息'),context={identity:f.identity,kind:'agent',eligible:true,groupDirected:false};
 noteDirectReply(context,'合成实际回复','accepted-agent');noteDirectReply(context,'合成实际回复','accepted-agent');
 const room=read('groups/rooms/'+f.key+'.json',{});assert.equal(room.messages.filter(m=>m.id==='accepted-agent').length,1);assert.equal(room.directThread?.receiptId,'accepted-agent');
});

for(const text of ['好的','谢谢','收到','晚安','拜拜','[表情123]','今天食堂的面不好吃'])test('unrelated content or a closing acknowledgment is not automatically a follow-up: '+text,()=>{
 const m={senderId:'member-a',content:text};const r=replyEligibility(m,{thread:{sender:'member-a',at:Date.now(),topic:['额度'],depth:0}});assert.notEqual(r.action,'REPLY');
});
test('a new member, intervening speaker, expired thread and exhausted ambiguous depth do not inherit the thread',()=>{
 const m={senderId:'member-a',content:'那你觉得呢'},thread={sender:'member-a',at:Date.now(),topic:['额度'],depth:0};
 for(const options of [{thread:{...thread,sender:'other'}},{thread,intervening:true},{thread:{...thread,at:Date.now()-180000}},{thread:{...thread,depth:2}}])assert.notEqual(replyEligibility(m,options).action,'REPLY');
});
test('other-member mentions and quotes remain addressed elsewhere',async()=>{
 for(const message of [{content:'<@other-member> 你今天又更新了',mentions:[{id:'other-member',is_you:false}]},{refMsgIdx:'other-quote',quotedIsSelf:false,quotedSenderId:'other-member'}]){
  const f=fixture('你今天又更新了',{message});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);
 }
});
test('third-person discussion is not a direct call to the bot',()=>{
 for(const content of ['他怎么不理我','她今天更新了客户端','小明问你怎么不回我','你说的那个软件今天更新了'])assert.notEqual(replyEligibility({senderId:'member-a',content}).action,'REPLY');
});
test('disabled groups do not enable themselves from conversational address',async()=>{
 const f=fixture('你今天又更新了',{enabled:false});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);
});
