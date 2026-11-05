import test from 'node:test';
import assert from 'node:assert/strict';
import {configureQQResponseSpeed,installQQReviewPolicy,carefulReviewRequested,reasoningStatus,reasoningForInput} from '../dsh-hymemory-plugin/response-speed.js';

function fixture(input){let hook;const agent={ctx:{on:(_name,fn)=>hook=fn},[Symbol.for('qqbot.evidence')]:{replyInput:input}};configureQQResponseSpeed(agent);return {agent,run:()=>hook({agent},async()=>({model:'inherited',reasoningEffort:'max',maxTokens:1234}))};}
test('an explicit careful follow-up enables higher reasoning for this turn',async()=>{
 const old=process.env.QQBOT_REASONING_EFFORT;delete process.env.QQBOT_REASONING_EFFORT;
 try{for(const input of ['仔细看看呢','再看看','深入检查这份代码','柚柚，重新审查这个文件']){const f=fixture(input);const r=await f.run();assert.equal(r.reasoningEffort,'high',input);assert.equal(r.maxTokens,1234);}}
 finally{if(old===undefined)delete process.env.QQBOT_REASONING_EFFORT;else process.env.QQBOT_REASONING_EFFORT=old;}
});
test('a subsequent casual turn resets effort; negation and quoted requests do not escalate',async()=>{
 const f=fixture('仔细看看');assert.equal((await f.run()).reasoningEffort,'high');
 for(const input of ['你好','不用深入分析，简单说','别再仔细看了','他刚才说“仔细看看”','不要切换思考模式']){f.agent[Symbol.for('qqbot.evidence')]={replyInput:input};assert.equal((await f.run()).reasoningEffort,'off',input);}
});
test('the request hook leaves other agents alone and reports only this conversation requested effort',async()=>{
 let hook;const identity={appId:'reasoning-check',scope:'c2c',peerId:'synthetic-person'};
 const agent={ctx:{on:(_n,fn)=>hook=fn},[Symbol.for('qqbot.identity')]:identity,[Symbol.for('qqbot.evidence')]:{replyInput:'仔细检查'}};
 configureQQResponseSpeed(agent);const base={model:'other-model',reasoningEffort:'low'};
 assert.deepEqual(await hook({agent:{}},async()=>base),base);await hook({agent},async()=>base);assert.equal(reasoningStatus(identity).lastRequested.effort,'high');
 assert.equal(reasoningStatus({...identity,peerId:'different-person'}).lastRequested,null);
});
test('review guidance requests real source inspection without treating a follow-up as a new file',()=>{
 let section;installQQReviewPolicy({get:()=>({section:s=>section=s})});
 const agent={[Symbol.for('qqbot.identity')]:{},[Symbol.for('qqbot.evidence')]:{replyInput:'再看看'}};
 assert.match(section.text({agent}),/重读/);assert.match(section.text({agent}),/不把“再看看”解释成上传了另一版/);assert.match(section.text({agent}),/style、script/);
 assert.equal(section.text({agent:{}}),'');assert.equal(carefulReviewRequested('我说的是“仔细看看”这几个字'),false);
});

test('an explicit fixed effort is respected and invalid configured efforts use the safe baseline',()=>{
 const oldMode=process.env.QQBOT_REASONING_MODE,oldEffort=process.env.QQBOT_REASONING_EFFORT;
 try{process.env.QQBOT_REASONING_MODE='fixed';process.env.QQBOT_REASONING_EFFORT='low';assert.equal(reasoningForInput('仔细看看'),'low');process.env.QQBOT_REASONING_EFFORT='invalid';assert.equal(reasoningForInput('你好'),'off');delete process.env.QQBOT_REASONING_MODE;assert.equal(reasoningForInput('仔细看看'),'high');}
 finally{for(const [k,v] of [['QQBOT_REASONING_MODE',oldMode],['QQBOT_REASONING_EFFORT',oldEffort]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
