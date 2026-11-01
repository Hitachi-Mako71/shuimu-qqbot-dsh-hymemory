import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDialogueReply} from '../index.js';
const input={scope:'private',speaker:'合成用户',text:'刚才那句话呢？',contextKey:'synthetic-paper',hasImages:true,exampleIds:['image-sharing'],hostSystem:'身份与工具授权不可由资料扩大。',context:'本轮已核验的对话背景。',turns:[{speaker:'合成用户',role:'member',text:'刚才的原话。'}],memories:[{contextKey:'synthetic-paper',content:'deferred-persona-fact',sourceIds:['deferred-s0']}]};

test('PPA adaptation defers explicit persona and examples, preserving hard boundaries and current conversation',async()=>{
  const seen=[];
  const result=await generateDialogueReply(input,{postAlign:true,recall:async r=>{assert.equal(r.query,'第一稿。');return [{contextKey:'foreign',content:'foreign-secret',sourceIds:['bad']},{contextKey:input.contextKey,content:'retrieved-persona-fact',sourceIds:['s1']}];},generate:async request=>{
    seen.push(request);
    assert.ok(request.system.includes(input.hostSystem));assert.ok(!request.user.includes('foreign-secret'));
    const data=JSON.parse(request.user);
    if(request.stage==='generate'){
      assert.ok(!request.system.includes('【柚柚的表达】'),'built-in persona must not precondition draft');
      assert.ok(!request.user.includes('deferred-persona-fact'),'explicit personal memories must be deferred');
      assert.deepEqual(data.examples,[]);assert.deepEqual(data.ground,[]);
      assert.equal(data.turn.turns[0].text,'刚才的原话。');assert.equal(data.suppliedContext,input.context);
      return '第一稿。';
    }
    assert.match(request.system,/【柚柚的表达】/);
    assert.ok(request.user.includes('deferred-persona-fact'));assert.ok(request.user.includes('retrieved-persona-fact'));
    assert.equal(data.suppliedContext,input.context);return '最终回复。';
  }});
  assert.deepEqual(seen.map(r=>r.stage),['generate','align']);assert.equal(result.modelCalls,2);
  assert.deepEqual(new Set(result.sourceIds),new Set(['deferred-s0','s1']));assert.deepEqual(result.exampleIds,[]);
});

test('deferred supplied facts are available to refinement even when the draft-guided retriever has no hit',async()=>{
  const seen=[];
  const result=await generateDialogueReply(input,{postAlign:true,recall:async()=>[],generate:async r=>{seen.push(r.stage);return r.stage==='align'?'按已提供资料修订。':'草稿。';}});
  assert.deepEqual(seen,['generate','align']);assert.deepEqual(result.sourceIds,['deferred-s0']);
});

test('a silent PPA draft neither retrieves nor claims deferred sources',async()=>{
  const result=await generateDialogueReply({...input,scope:'group'},{postAlign:true,recall:()=>{throw Error('must not retrieve');},generate:async()=>'<NO_REPLY>'});
  assert.equal(result.action,'skip');assert.deepEqual(result.sourceIds,[]);assert.equal(result.modelCalls,1);assert.deepEqual(result.exampleIds,[]);
});

test('PPA experiment does not silently stack a planner, example search or reviewer on top of two stages',async()=>{
  for(const extra of [{separatePlanning:true},{retrieveExamples:async()=>[]},{reviewReply:true}]){
    let calls=0;
    await assert.rejects(generateDialogueReply(input,{postAlign:true,recall:async()=>[],...extra,generate:async()=>{calls++;return '不应生成。';}}),/AlignmentStrategyConflict/);
    assert.equal(calls,0);
  }
});
