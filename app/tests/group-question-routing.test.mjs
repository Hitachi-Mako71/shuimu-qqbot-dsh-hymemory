import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {groupParticipationGate,registerGroupParticipation} from '../dsh-hymemory-plugin/group-participation.js';
import {read,write} from '../dsh-hymemory-plugin/companion-state.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-question-routing-'));
Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_MODEL_ROUTING_FILE:path.join(root,'routing.json')});
let dispose,n=0;registerGroupParticipation({effect:fn=>{dispose=fn();}});
test.after(()=>{dispose();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-question-routing-/);fs.rmSync(root,{recursive:true,force:true});});
function fixture(text,{enabled=true,frequency='正常',snoozeUntil=0,activity={},policy='adaptive'}={}){
 const identity={appId:'question-test',scope:'group',peerId:'synthetic-room-'+(++n),senderId:'synthetic-person'},key=memoryNamespace(identity);
 const reg=read('groups/registry.json',{rooms:{}});reg.rooms[key]={enabled,frequency,snoozeUntil,controller:identity.senderId,conversationPolicy:policy,allMessages:0,atMessages:0,activity};write('groups/registry.json',reg);
 const ctx={message:{kind:'group',groupOpenid:identity.peerId,senderId:identity.senderId,content:text,messageId:'synthetic-question-'+n,rawEventType:'GROUP_MESSAGE_CREATE',attachments:[]},state:{mention:{wasMentioned:false},qqEvidence:{}},replyTarget:{scope:'group',targetId:identity.peerId,msgId:'synthetic-question-'+n},bot:{}};
 let calls=0;return {identity,key,ctx,next:async()=>calls++,count:()=>calls};
}
for(const frequency of ['正常','安静'])for(const text of ['训练模型时的烟雾训练是指什么','这个报错怎么解决？','1+1等于几','怎么配置这个模型','有没有人知道这是什么','What is gradient accumulation?'])test('enabled '+frequency+' group directly answers question: '+text,async()=>{
 const f=fixture(text,{frequency});await groupParticipationGate(f.ctx,f.next,f.identity.appId);
 assert.equal(f.count(),1);assert.equal(f.ctx.state.mention.shouldAnswer,true);assert.equal(f.ctx.state.mention.wasMentioned,false);assert.equal(f.ctx.state.qqEvidence.groupDirected,true);
});
for(const [name,options,mutate]of [
 ['disabled',{enabled:false},()=>{}],['snoozed',{snoozeUntil:Date.now()+600000},()=>{}],['opt-out',{activity:{replyQuestions:false}},()=>{}],
 ['another addressee',{},f=>{f.ctx.message.mentions=[{id:'other-person',is_you:false}];}],
 ['other quoted speaker',{},f=>{f.ctx.message.refMsgIdx='other-quote';f.ctx.message.quotedIsSelf=false;}],
 ['known bot',{},f=>{f.ctx.message.senderIsBot=true;}],
])test('question preserves exclusion: '+name,async()=>{const f=fixture('这个问题怎么解决？',options);mutate(f);await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
for(const text of ['今天作业写完了','他说“怎么配置模型？”然后就走了','示例代码：`print("why?")`','/help?'])test('statement, quoted question or slash command stays selective: '+text,async()=>{const f=fixture(text);await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
test('ambient cooldown does not delay a normal question',async()=>{const f=fixture('这个概念是什么意思');const reg=read('groups/registry.json',{});reg.rooms[f.key].lastReplyAt=Date.now();write('groups/registry.json',reg);await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);});

for(const text of ['这模型怎么训练','她现在怎么不在群里聊天'])test('question with an initial subject routes directly: '+text,async()=>{const f=fixture(text);await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),1);});
for(const text of ['我已经知道怎么配置模型了','https://example.invalid/?key=value'])test('statement or URL query is not a conversational question: '+text,async()=>{const f=fixture(text);await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});

test('active legacy group also yields to a quote of another speaker',async()=>{const f=fixture('这个该怎么办？',{frequency:'活跃',policy:'legacy'});f.ctx.message.refMsgIdx='other-message';f.ctx.message.quotedIsSelf=false;await groupParticipationGate(f.ctx,f.next,f.identity.appId);assert.equal(f.count(),0);});
