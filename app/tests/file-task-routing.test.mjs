import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {historyPlan,historyTurn} from '../dsh-hymemory-plugin/history.js';
import {recallConversation} from '../dsh-hymemory-plugin/conversation-policy.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-file-intent-'));
process.env.QQBOT_COMPANION_DIR=root;
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-file-intent-/);fs.rmSync(root,{recursive:true,force:true});});
const identity={appId:'file-intent',scope:'c2c',peerId:'synthetic-person'},base={message_id:'synthetic-file-turn'};
for(const input of ['读取刚才的两份 md 文件，分别概括标题和第一节','总结这个附件的第一节','打开刚发的报告.pdf','概括这个文件里的历史数据']){
  test('current file task avoids history-only routing: '+input,async()=>{
    assert.equal(historyPlan(input),null);
    let calls=0;assert.equal(await historyTurn({input,base,request:async()=>{calls++;return {};}}),null);assert.equal(calls,0);
  });
  test('current file task does not wait on optional semantic recall: '+input,async()=>{
    for(const enabled of [false,true]){fs.writeFileSync(path.join(root,'conversation-policy.json'),JSON.stringify({enabled}));let calls=0;
      const result=await recallConversation({identity,input,base,request:async()=>{calls++;return {memories:[]};}});
      assert.equal(calls,0);assert.deepEqual(result,{memories:[],sourceIds:[],context:''});
    }
  });
}
test('explicit original/history lookup remains a real history request',async()=>{
  const input='查历史：刚才聊过什么文件';assert.deepEqual(historyPlan(input),{mode:'search',explicit:true});
  let endpoint;const result=await historyTurn({input,base,request:async(e)=>{endpoint=e;return {sources:[]};}});assert.equal(endpoint,'/history/search');assert.equal(result.handled,true);
});
for(const input of ['还记得我上次上传的文档吗','结合我以前的偏好总结这个文件'])test('personal history dependency is not silently discarded: '+input,async()=>{
  assert.equal(historyPlan(input)?.mode,'search');let calls=0;await recallConversation({identity,input,base,request:async()=>{calls++;return {memories:[]};}});assert.equal(calls,1);
});

for(const input of ['按我的偏好总结这个文件','总结这个附件并对比上次的讨论','查记忆：我之前对这个文件的要求'])test('mixed file/history task keeps semantic recall: '+input,async()=>{
  let calls=0;await recallConversation({identity,input,base,request:async()=>{calls++;return {memories:[]};}});assert.equal(calls,1);
});
