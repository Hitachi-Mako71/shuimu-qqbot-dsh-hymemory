import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Context} from '../runtime/node_modules/@deepseek-ai/cordis/lib/index.js';
import {createMiddlewareContext} from 'file:///D:/DeepSeekHarnessData/home/profiles/qqbot/node_modules/@tencent-connect/qqbot-nodejs/dist/middleware/types.js';
import {withQQInboundSignal} from '../dsh-hymemory-plugin/turn-context.js';
import {configureQQTurnBudget} from '../dsh-hymemory-plugin/turn-budget.js';
import {memoryRequest} from '../dsh-hymemory-plugin/memory-client.js';
import {archiveQQInbound,bindQQEvidence,instrumentQQEvidence,withQQEvidence,closeQQEvidence} from '../dsh-hymemory-plugin/evidence.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-cancel-test-'));
Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_METRICS_DIR:path.join(root,'metrics'),MEMORY_BRIDGE_TOKEN:'synthetic-token'});
test.after(()=>{closeQQEvidence();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-cancel-test-/);fs.rmSync(root,{recursive:true,force:true});});
const identity={appId:'synthetic-app',scope:'c2c',peerId:'person-a',senderId:'person-a'};
function incoming(bot={}){return createMiddlewareContext({bot,log:{},message:{kind:'c2c',senderId:'person-a',messageId:crypto.randomUUID(),content:'公开合成测试',replyTarget:{scope:'c2c',targetId:'person-a'}}});}

test('real QQ SDK ctx.abort cancels a pending memory fetch through the inherited signal',async()=>{
  const ctx=incoming(),original=globalThis.fetch;let started;
  const ready=new Promise(resolve=>started=resolve);
  try{
    globalThis.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>{started();signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});});
    const request=withQQInboundSignal(ctx.signal,()=>memoryRequest('/search',identity,{query:'合成测试'}));
    await ready;ctx.abort('synthetic-timeout');await assert.rejects(request,{name:'AbortError'});
  }finally{globalThis.fetch=original;}
});

test('SDK cancellation reaches the owning agent and prevents a late QQ send',async()=>{
  let sent=0,cancels=0;
  const bot={sendMarkdown:async()=>{sent++;return {id:'synthetic-receipt'};}};
  instrumentQQEvidence(bot,identity.appId);
  const ctx=incoming(bot),agent={ctx:new Context(),session:{},cancel:()=>cancels++};
  await archiveQQInbound(ctx,async()=>{
    const budget=configureQQTurnBudget(agent,{maxMs:10000});
    bindQQEvidence(agent,ctx.state.qqEvidence,'synthetic-session');
    ctx.abort('synthetic-timeout');assert.equal(cancels,1);
    assert.throws(()=>budget.assertDelivery(),/QQTurnLimit/);
    assert.throws(()=>withQQEvidence(agent,()=>bot.sendMarkdown(ctx.replyTarget,'公开合成回复')),error=>error==='synthetic-timeout');
  },identity.appId);
  assert.equal(sent,0);
});

test('a completed turn detaches its abort listener so an old SDK timeout cannot cancel a new turn',()=>{
  let cancels=0;
  const ctx=incoming(),agent={ctx:new Context(),session:{},cancel:()=>cancels++};
  withQQInboundSignal(ctx.signal,()=>configureQQTurnBudget(agent,{maxMs:10000}).finish());
  const current=configureQQTurnBudget(agent,{maxMs:10000});
  ctx.abort('old-timeout');assert.equal(cancels,0);current.finish();
});
