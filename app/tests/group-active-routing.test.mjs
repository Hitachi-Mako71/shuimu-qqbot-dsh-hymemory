import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {groupParticipationGate,registerGroupParticipation} from '../dsh-hymemory-plugin/group-participation.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';
import {read,write} from '../dsh-hymemory-plugin/companion-state.js';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qq-active-routing-'));
Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(temp,'companion'),QQBOT_MODEL_ROUTING_FILE:path.join(temp,'route.json'),QQBOT_PRIVACY_DIR:path.join(temp,'privacy'),QQBOT_EVIDENCE_DIR:path.join(temp,'evidence'),QQBOT_APPID:'active-route-test'});
let sequence=0,dispose;
registerGroupParticipation({effect:fn=>{dispose=fn();}});
test.after(()=>{dispose();assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));assert.match(path.basename(temp),/^qq-active-routing-/);fs.rmSync(temp,{recursive:true,force:true});});
function fixture({frequency='活跃',enabled=true,snoozeUntil=0,text='这会儿有空，随便聊聊。'}={}){
 const identity={appId:'active-route-test',scope:'group',peerId:'group-'+(++sequence),senderId:'member-'+sequence},key=memoryNamespace(identity);
 const reg=read('groups/registry.json',{rooms:{}});reg.rooms[key]={enabled,frequency,controller:'verified-owner',allMessages:0,atMessages:0,sent:0,snoozeUntil};write('groups/registry.json',reg);
 const ctx={message:{kind:'group',groupOpenid:identity.peerId,senderId:identity.senderId,content:text,messageId:'message-'+sequence,rawEventType:'GROUP_MESSAGE_CREATE',attachments:[]},state:{mention:{wasMentioned:false,shouldAnswer:false}},bot:{sendMarkdown:async()=>{throw Error('gate must not invent or manually send a reply');}},replyTarget:{scope:'group',targetId:identity.peerId,msgId:'message-'+sequence}};
 let normalTurns=0;const next=async()=>{normalTurns++;assert.equal(ctx.replyTarget.targetId,identity.peerId);assert.equal(ctx.message.senderId,identity.senderId);};
 return {identity,key,ctx,next,count:()=>normalTurns,row:()=>read('groups/registry.json',{}).rooms[key]};
}
test('first ordinary unmentioned active-group message reaches the normal agent without a listening decision',async()=>{
 const f=fixture();await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);assert.equal(f.ctx.state.mention.shouldAnswer,true);assert.equal(f.ctx.state.mention.wasMentioned,false);assert.equal(f.row().lastDecision.reason,'活跃模式进入正常对话');
});
test('short statements do not need a question mark, bot name or three-message threshold',async()=>{
 for(const text of ['嗯','今天终于写完作业了','这个想法挺有意思']){const f=fixture({text});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);}
});
test('unmentioned image without a caption reaches the normal vision and attachment pipeline',async()=>{
 const f=fixture({text:''});f.ctx.message.attachments=[{content_type:'image/png',url:'https://example.invalid/synthetic.png'}];await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);assert.equal(f.ctx.state.mention.wasMentioned,false);
});
test('unmentioned file without a caption reaches the normal guarded attachment pipeline',async()=>{
 const f=fixture({text:''});f.ctx.message.attachments=[{content_type:'file',filename:'synthetic.csv',url:'https://example.invalid/synthetic.csv'}];await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);
});
test('a media quote can be handled even without separate text',async()=>{
 const f=fixture({text:''});f.ctx.state.qqMedia={quoteAttachments:[{content_type:'image/png'}]};await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);
});
test('genuinely empty messages still do not invoke the agent',async()=>{const f=fixture({text:''});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
test('old ambient cooldown and hourly quota do not swallow normal active conversations',async()=>{
 const f=fixture(),reg=read('groups/registry.json',{});reg.rooms[f.key].lastReplyAt=Date.now();write('groups/registry.json',reg);
 write('groups/rooms/'+f.key+'.json',{messages:[],deliveries:Array.from({length:24},()=>({at:Date.now(),kind:'ambient'})),lastJudgedAt:Date.now(),newMessages:0});
 await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);
});
test('successive members are routed with their own sender identity and fresh message target',async()=>{
 const f=fixture();await groupParticipationGate(f.ctx,f.next,f.identity.appId);
 const second={...f.ctx,message:{...f.ctx.message,senderId:'another-member',messageId:'second-member'},state:{mention:{wasMentioned:false}},replyTarget:{...f.ctx.replyTarget,msgId:'second-member'}};
 let routed=false;await groupParticipationGate(second,async()=>{routed=true;assert.equal(second.message.senderId,'another-member');assert.equal(second.replyTarget.msgId,'second-member');},f.identity.appId);assert.equal(routed,true);
});
test('disabled group still does not route ordinary conversation',async()=>{const f=fixture({enabled:false});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
test('explicit group snooze suppresses ordinary active replies',async()=>{const f=fixture({snoozeUntil:Date.now()+600000});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
test('bot echoes do not reach the agent',async()=>{const f=fixture();f.ctx.message.senderIsBot=true;await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
test('questions directed to another mentioned member do not become an active reply',async()=>{const f=fixture({text:'<@other-member> 这个你怎么看'});f.ctx.message.mentions=[{id:'other-member',is_you:false}];await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
test('raw mention of another member remains excluded even if SDK mention list is absent',async()=>{const f=fixture({text:'<@other-member> 来聊聊'});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
test('real bot mention continues through normal reply and stays marked as a real mention',async()=>{const f=fixture({enabled:false});f.ctx.message.rawEventType='GROUP_AT_MESSAGE_CREATE';await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);assert.equal(f.ctx.state.mention.wasMentioned,true);});
test('name calls retain the existing implicit-address behavior',async()=>{const f=fixture({text:'柚柚你好'});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);assert.equal(f.ctx.state.mention.wasMentioned,true);});
test('normal and quiet groups retain selective listening',async()=>{for(const frequency of ['正常','安静']){const f=fixture({frequency});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);}});
test('an explicit mention greeting in a normal group is a directed request and preserves its frequency',async()=>{
 const f=fixture({frequency:'正常',text:'@我打个招呼'});await groupParticipationGate(f.ctx,f.next,f.identity.appId);
 assert.equal(f.count(),1);assert.equal(f.row().frequency,'正常');assert.equal(f.ctx.state.mention.shouldAnswer,true);
});
test('disabled groups do not activate merely because of a textual mention greeting',async()=>{
 const f=fixture({frequency:'正常',enabled:false,text:'@我打个招呼'});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);
});
test('secret-only placeholders and unaddressed slash commands stay excluded',async()=>{for(const text of ['[凭证已隐藏]','/some-command']){const f=fixture({text});await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);}});
test('closing during the next turn cannot be overwritten by completion bookkeeping',async()=>{
 const f=fixture();await groupParticipationGate(f.ctx,async()=>{const reg=read('groups/registry.json',{});reg.rooms[f.key].enabled=false;write('groups/registry.json',reg);},f.identity.appId);assert.equal(f.row().enabled,false);
});
test('non-group messages pass through unchanged',async()=>{const f=fixture();f.ctx.message.kind='c2c';await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);});
