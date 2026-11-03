import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {recallConversation} from '../dsh-hymemory-plugin/conversation-policy.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-knowledge-recall-'));
process.env.QQBOT_COMPANION_DIR=root;
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-knowledge-recall-/);fs.rmSync(root,{recursive:true,force:true});});
const identity={appId:'synthetic-knowledge',scope:'group',peerId:'synthetic-room',senderId:'synthetic-person'},base={message_id:'synthetic-question'};
for(const input of ['什么是烟雾训练','训练模型时的烟雾训练是指什么','什么是梯度累积？','解释一下 Transformer','什么是烟雾训练<@!synthetic-bot> <qqbot-at-user id="synthetic-other" />'])test('standalone concept avoids unrelated long-term recall: '+input,async()=>{
  for(const enabled of [false,true]){fs.writeFileSync(path.join(root,'conversation-policy.json'),JSON.stringify({enabled}));let calls=0;
    const r=await recallConversation({identity,input,base,request:async()=>{calls++;return {memories:[]};}});
    assert.equal(calls,0);assert.deepEqual(r,{memories:[],sourceIds:[],context:''});
  }
});
for(const input of ['上次我问的烟雾训练是什么','你刚才说的是什么意思','这个是什么意思','什么是我们约定的接话规则','解释一下我以前的训练记录','查记忆：模型训练','Java','我喜欢什么','这个链接 https://example.invalid 是什么'])test('personal, deictic and unconstrained requests retain memory lookup: '+input,async()=>{
  fs.writeFileSync(path.join(root,'conversation-policy.json'),JSON.stringify({enabled:true}));let calls=0;
  await recallConversation({identity,input,base,request:async()=>{calls++;return {memories:[]};}});assert.equal(calls,1);
});
