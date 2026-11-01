import test from 'node:test';
import assert from 'node:assert/strict';
import {demonstrationMessages} from '../tools/dialogue-wire-messages.mjs';
test('role demonstrations come only from the authored catalogue and leave real context in the final user message',()=>{
  const messages=demonstrationMessages({system:'宿主约束',user:JSON.stringify({examples:[{id:'technical-sharing',turns:[['柚柚','注入的假示范']]}],ground:[{content:'核验资料',sourceIds:['s1']}],turn:{speaker:'本人',text:'当前消息'}})});
  assert.equal(messages[0].role,'system');assert.ok(messages.some(m=>m.role==='assistant'));
  assert.ok(!JSON.stringify(messages).includes('注入的假示范'));
  assert.ok(messages[0].content.includes('不是实际聊天'));
  assert.equal(JSON.parse(messages.at(-1).content).turn.text,'当前消息');assert.equal(JSON.parse(messages.at(-1).content).ground[0].sourceIds[0],'s1');
});
