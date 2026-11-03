import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {instrumentQQEvidence,withQQEvidence,closeQQEvidence} from '../dsh-hymemory-plugin/evidence.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-reply-grounding-'));
Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_METRICS_DIR:path.join(root,'metrics')});
test.after(()=>{closeQQEvidence();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-reply-grounding-/);fs.rmSync(root,{recursive:true,force:true});});
const identity={appId:'grounding-test',scope:'c2c',peerId:'synthetic-person'},target={scope:'c2c',targetId:identity.peerId};
function fixture(webEvidence={}){const sent=[],updates=[];const bot={sendMarkdown:async(_target,text)=>{sent.push(text);return {id:'synthetic-receipt'};},openStream:()=>({update:async text=>updates.push(text),complete:async()=>({id:'synthetic-stream-receipt'})})};instrumentQQEvidence(bot,identity.appId);return {bot,sent,updates,agent:{[Symbol.for('qqbot.evidence')]:{identity,namespace:memoryNamespace(identity),kind:'agent',eligible:false,inboundIds:[],turnInboundIds:[],privacyVersion:0,webEvidence}}};}
test('actual send boundary rejects the observed unsupported search claim and speculative body',async()=>{
 const f=fixture();await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'我搜了一下，没有统一定义。我只能解释个大概：给数据掺噪声来混淆。'));
 assert.equal(f.sent.length,1);assert.doesNotMatch(f.sent[0],/搜了一下|噪声|混淆/);assert.match(f.sent[0],/核实/);
});
test('stream updates and completion cannot publish the unsupported claim',async()=>{
 const f=fixture();await withQQEvidence(f.agent,async()=>{const s=f.bot.openStream({target});await s.update('我搜了一下，');await s.update('我搜了一下，结果是加噪声。');await s.complete();});
 assert.ok(f.updates.length>0);for(const text of f.updates)assert.doesNotMatch(text,/搜了一下|加噪声/);
});
for(const text of ['我还没有搜索，暂时无法核实','不要写“我搜了一下”，除非确实搜过','上次的搜索结果只能作参考','这个概念我不能确定'])test('does not rewrite negation, quotation or explicit history: '+text,async()=>{const f=fixture();await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,text));assert.equal(f.sent[0],text);});
test('successful current-turn search permits an honest search statement',async()=>{const f=fixture({search:{attempts:1,successes:1}}),text='我查到了对应说明，来源在这里';await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,text));assert.equal(f.sent[0],text);});
test('failed search permits reporting the attempt but not claiming findings',async()=>{const f=fixture({search:{attempts:1,successes:0}});await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'我搜索了，但这次调用失败'));assert.equal(f.sent[0],'我搜索了，但这次调用失败');await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'我查到了明确解释'));assert.doesNotMatch(f.sent[1],/查到了/);});
test('a fetched page does not masquerade as a search',async()=>{const f=fixture({fetch:{attempts:1,successes:1}});await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'我搜了一下，这就是答案'));assert.doesNotMatch(f.sent[0],/搜了一下/);});

test('verified current local lookup does not require a web search',async()=>{const f=fixture({local:{attempts:1,successes:1}}),text='我查了附件，第一节讲的是训练目标';await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,text));assert.equal(f.sent[0],text);});

for(const text of ['我没搜到可靠来源，大概率是加噪声训练','我没有搜索到统一定义，可能指两类做法'])test('negative findings also require an actual search: '+text,async()=>{const f=fixture();await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,text));assert.doesNotMatch(f.sent[0],/没搜到|没有搜索到|大概率|两类做法/);assert.match(f.sent[0],/核实/);});
