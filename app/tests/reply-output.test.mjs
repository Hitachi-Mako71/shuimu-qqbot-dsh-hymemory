import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {instrumentQQEvidence,withQQEvidence,closeQQEvidence} from '../dsh-hymemory-plugin/evidence.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-compact-output-'));
Object.assign(process.env,{QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_METRICS_DIR:path.join(root,'metrics')});
test.after(()=>{closeQQEvidence();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-compact-output-/);fs.rmSync(root,{recursive:true,force:true});});
const identity={appId:'compact-output-check',scope:'c2c',peerId:'person'},target={scope:'c2c',targetId:identity.peerId};
function fixture(replyInput='你又死了？',kind='agent'){
 const sent=[],updates=[];
 const bot={sendMarkdown:async(t,text)=>{sent.push(text);return {id:'synthetic-markdown'};},sendText:async(t,text)=>{sent.push(text);return {id:'synthetic-text'};},send:async payload=>{sent.push(payload.markdown?.content??payload.content);return {id:'synthetic-payload'};},openStream:()=>({update:async text=>updates.push(text),complete:async()=>({id:'synthetic-stream'})})};
 instrumentQQEvidence(bot,identity.appId);
 return {bot,sent,updates,agent:{[Symbol.for('qqbot.evidence')]:{identity,namespace:memoryNamespace(identity),kind,replyInput,eligible:false,inboundIds:[],turnInboundIds:[],privacyVersion:0}}};
}

test('the screenshot response sends only the acknowledgement, deleting the unasked diagnosis',async()=>{
 const f=fixture();await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'我在，没死。\n\n可能又是那边卡了一下，或者消息没发出去吧'));
 assert.deepEqual(f.sent,['我在，没死']);
});
test('normal prose is one paragraph without deleting substantive later sentences',async()=>{
 const f=fixture('概括主要内容');await withQQEvidence(f.agent,()=>f.bot.sendText(target,'第一项是数据读取。\n  \n第二项是消息发送。\n第三项是记录回执。'));
 assert.equal(f.sent[0],'第一项是数据读取。 第二项是消息发送。 第三项是记录回执');
});
test('unasked closing meta-analysis is removed from a summary while requested analysis is retained',async()=>{
 const text='这篇文章讨论多人对话。\n\n这里有一点值得注意：你之前列的那几条其实已经写得很明白。';
 const simple=fixture('概括这篇文章');await withQQEvidence(simple.agent,()=>simple.bot.sendMarkdown(target,text));assert.equal(simple.sent[0],'这篇文章讨论多人对话');
 const asked=fixture('帮我分析并比较这篇文章和之前的观点');await withQQEvidence(asked.agent,()=>asked.bot.sendMarkdown(target,text));assert.match(asked.sent[0],/你之前列的/);assert.doesNotMatch(asked.sent[0],/\n/);
});
test('explicit no-analysis overrides analysis keywords and a single-line tail is also removed',async()=>{
 const f=fixture('别分析，告诉我你在不在');await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'我在。可能是网络卡了一下。'));assert.equal(f.sent[0],'我在');
});
test('fenced code retains its indentation and blank lines',async()=>{
 const f=fixture('给我代码');const code='下面是代码：\n```python\ndef run():\n    a = 1\n\n    return a\n```';await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,code));assert.equal(f.sent[0],code);
});
test('explicit line formatting retains necessary line breaks but no blank separators',async()=>{
 const f=fixture('请分行列出两个步骤');await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'1. 打开文件\n\n2. 读取正文'));assert.equal(f.sent[0],'1. 打开文件\n2. 读取正文');
});
test('payload and stream snapshots obey the same output rule',async()=>{
 const f=fixture();await withQQEvidence(f.agent,async()=>{
  await f.bot.send({target,content:'我在。\n\n可能是卡住了。'});
  await f.bot.send({target,markdown:{content:'我在。\n\n可能是卡住了。'}});
  const stream=f.bot.openStream({target});await stream.update('我在。\n\n可');await stream.update('我在。\n\n可能是卡住了。');await stream.complete();
 });assert.deepEqual(f.sent,['我在','我在']);for(const text of f.updates)assert.doesNotMatch(text,/\n|可能|可$/);assert.ok(f.updates.length>=2);
});
test('group and background generated messages are compact while control messages keep their layout',async()=>{
 for(const kind of ['group','background']){const f=fixture('',kind);await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'好，收到。\n\n我先确认一下你的意思，其实你是想继续。'));assert.equal(f.sent[0],'好，收到');}
 const control=fixture('', 'inbound');await withQQEvidence(control.agent,()=>control.bot.sendMarkdown(target,'设置状态\n\n保持原样'));assert.equal(control.sent[0],'设置状态\n\n保持原样');
});
test('the second screenshot drops the expression postmortem and unrelated follow-up',async()=>{
 const f=fixture('你有点高冷');await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,'被你发现了。刚才是嫌自己话多，就往回收了收，结果收过头了。\n\n今晚在忙什么？'));assert.equal(f.sent[0],'被你发现了');
});
test('explicit verbatim output preserves quoted diagnostic text and internal marker examples',async()=>{
 const f=fixture('原样输出下面的文字');const text='我在。\n可能是网络卡了一下。\n`<qqbot:next-message/>`';await withQQEvidence(f.agent,()=>f.bot.sendMarkdown(target,text));assert.equal(f.sent[0],text);
});
