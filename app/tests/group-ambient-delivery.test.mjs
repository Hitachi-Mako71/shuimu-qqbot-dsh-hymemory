import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {registerCompanion} from '../dsh-hymemory-plugin/companion.js';
import {groupParticipationGate,registerGroupParticipation} from '../dsh-hymemory-plugin/group-participation.js';
import {read,write} from '../dsh-hymemory-plugin/companion-state.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';
import {closeQQEvidence} from '../dsh-hymemory-plugin/evidence.js';

test('ambient reply reaches the send boundary with terminal full stops removed and confirmed local state',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-ambient-delivery-'));
  const savedEnv={...process.env},savedFetch=globalThis.fetch,disposers=[];
  try{
    Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_MODEL_ROUTING_FILE:path.join(root,'routing.json'),QQBOT_METRICS_DIR:path.join(root,'metrics'),MEMORY_BRIDGE_URL:'http://127.0.0.1:1',MEMORY_BRIDGE_TOKEN:'synthetic-only'});
    const identity={appId:'synthetic-ambient',scope:'group',peerId:'synthetic-room',senderId:'synthetic-person'},key=memoryNamespace(identity);
    write('conversation-policy.json',{enabled:true,groupContext:{mode:'legacy'}});
    write('groups/registry.json',{rooms:{[key]:{enabled:true,controller:identity.senderId,frequency:'正常',allMessages:0,atMessages:0,sent:0,activity:{enabled:true,minMessages:1,judgeIntervalSeconds:0,replyQuestions:false}}}});
    let models=0,memoryCalls=0;
    globalThis.fetch=async(url)=>{assert.equal(String(url),'http://127.0.0.1:1/search');memoryCalls++;return Response.json({ok:true,memories:[]});};
    const llm={async *stream(){models++;yield {type:'text-delta',index:0,text:'这个思路可以。先从简单的开始。\n<qqbot:next-message/>\n慢慢完善就好。'};yield {type:'finish',reason:{kind:'stop'}};}};
    const effect=fn=>disposers.push(fn());registerCompanion({get:()=>llm,effect},{},identity.appId);registerGroupParticipation({effect});
    const sent=[],ctx={message:{kind:'group',content:'大家觉得这个思路怎么样？',messageId:'synthetic-message',groupOpenid:identity.peerId,senderId:identity.senderId,rawEventType:'GROUP_MESSAGE_CREATE'},state:{mention:{}},replyTarget:{scope:'group',targetId:identity.peerId,msgId:'synthetic-message'},bot:{sendMarkdown:async(target,text)=>{assert.equal(target.targetId,identity.peerId);sent.push(text);return {id:'synthetic-receipt-'+sent.length};}}};
    await groupParticipationGate(ctx,async()=>assert.fail('ambient message must use the participation branch'),identity.appId);
    const deadline=Date.now()+4000;
    while(Date.now()<deadline){const row=read('groups/registry.json',{}).rooms[key];if(row.sent===1||row.backoffUntil)break;await delay(20);}
    const row=read('groups/registry.json',{}).rooms[key];
    assert.equal(models,1);assert.equal(memoryCalls,1);
    assert.deepEqual(sent,['这个思路可以。先从简单的开始','慢慢完善就好'],row.status);
    assert.equal(row.sent,1);assert.equal(row.lastTimings.sent,true);
    assert.equal(read('groups/rooms/'+key+'.json',{}).lastAmbient.status,'accepted');
  }finally{
    for(const dispose of disposers.reverse())dispose?.();closeQQEvidence();globalThis.fetch=savedFetch;
    for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);
    assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-ambient-delivery-/);fs.rmSync(root,{recursive:true,force:true});
  }
});
