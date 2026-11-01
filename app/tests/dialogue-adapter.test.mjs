import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerCompanion } from '../dsh-hymemory-plugin/companion.js';
import { generateGroupDialogue, nativeDialogueContext } from '../dsh-hymemory-plugin/dialogue-adapter.js';
import { groupSpeakerContext } from '../dsh-hymemory-plugin/group-participation.js';
import { dialogueSystemPolicy } from '../dsh-hymemory-plugin/dialogue-engine/index.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-dialogue-adapter-'));
Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_MODEL_ROUTING_FILE:path.join(root,'routing.json')});
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-dialogue-adapter-/);fs.rmSync(root,{recursive:true,force:true});});
function fixture(text,finish='stop'){
  const requests=[];let dispose;
  const llm={async *stream(options){requests.push(options);yield {type:'text-delta',index:0,text};yield {type:'finish',reason:{kind:finish}};}};
  registerCompanion({get:()=>llm,effect:fn=>{dispose=fn();}}, {}, 'synthetic-dialogue-app');
  return {requests,dispose:()=>dispose()};
}
const context={selectedMessage:{label:'群友2',role:'member',text:'刚才那句不是我说的。'},quotedMessage:{label:'群友1',role:'other_bot',text:'我自己游进来的。'},recentGroupConversation:[{label:'群友1',role:'other_bot',text:'我自己游进来的。'},{label:'群友2',role:'member',text:'刚才那句不是我说的。'}]};
test('group adapter forwards distinct speaker/quote labels through the actual SDK assembler in one call',async()=>{
  const f=fixture('哦，我接错人了。');try{
    const out=await generateGroupDialogue('只回复当前话轮。',JSON.stringify(context),240,'synthetic-session');
    assert.equal(out,'哦，我接错人了。');assert.equal(f.requests.length,1);
    const request=f.requests[0];assert.equal(request.tools,undefined);assert.equal(request.maxTokens,240);
    const data=JSON.parse(request.messages.at(-1).content[0].text);
    assert.equal(data.turn.speaker,'群友2');assert.equal(data.turn.quoted.speaker,'群友1');
    assert.equal(data.turn.turns[0].role,'other_bot');assert.match(request.messages[0].content[0].text,/不习惯性反问/);
  }finally{f.dispose();}
});
test('group adapter preserves NO_REPLY and does not invent a fallback response',async()=>{
  const f=fixture('<NO_REPLY>');try{assert.equal(await generateGroupDialogue('',JSON.stringify(context),240,'synthetic-session'),'<NO_REPLY>');assert.equal(f.requests.length,1);}finally{f.dispose();}
});
test('model terminal errors propagate without producing a successful draft',async()=>{
  const f=fixture('不应作为成功回复。','error');try{await assert.rejects(generateGroupDialogue('',JSON.stringify(context),240,'synthetic-session'),/CompanionModelUnavailable/);}finally{f.dispose();}
});
test('native adapter observes current text and scope without exposing gateway IDs',()=>{
  const value=nativeDialogueContext({appId:'synthetic-app',scope:'group',peerId:'synthetic-room',senderId:'synthetic-member'},{text:'我说的是别人。',quotedText:'被引用的原文'});
  assert.match(value,/我说的是别人/);assert.match(value,/被引用的原文/);assert.match(value,/"scope":"group"/);assert.match(dialogueSystemPolicy('group'),/只用本群资料/);assert.doesNotMatch(value,/synthetic-member|synthetic-room|synthetic-app/);
});
test('a verified quote of our own message remains 柚柚 rather than another AI',()=>{
  const event={identity:{appId:'speaker-test',scope:'group',peerId:'room-a',senderId:'member-a'},sender:'speaker-hash',text:'这次说对了。',senderRole:'member',quotedSenderId:'bot-self',quotedIsSelf:true,quotedSenderIsBot:true,quotedText:'自己的原话'};
  const ctx=groupSpeakerContext([],event);assert.equal(ctx.quoted.label,'柚柚');assert.equal(ctx.quoted.role,'assistant');assert.equal(ctx.addressedTo,'self');
});
test('ambient group adapter honors verified other addressee without an LLM request',async()=>{
  const f=fixture('不应生成。');try{assert.equal(await generateGroupDialogue('',JSON.stringify({...context,replyTargetKind:'other'}),240,'synthetic-session'),'<NO_REPLY>');assert.equal(f.requests.length,0);}finally{f.dispose();}
});
