import test from 'node:test';
import assert from 'node:assert/strict';
let api={};try{api=await import('../dsh-hymemory-plugin/retention-policy.js');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const identity={appId:'fixture-app',scope:'c2c',peerId:'person-a',senderId:'person-a'};
test('shadow gate never rejects meaningful short statements',()=>{
  assert.equal(typeof api.retentionDecision,'function');
  for(const text of ['不去了','我同意','Java','你好，记得我的偏好吗'])assert.equal(api.retentionDecision(text).proposedRetain,true,text);
  for(const text of ['好的','谢谢','[表情123]','😀'])assert.equal(api.retentionDecision(text).proposedRetain,false,text);
});
test('windows are bounded, same-actor only, and control input breaks an open window',()=>{
  assert.equal(typeof api.createRetentionWindowAllocator,'function');
  let at=100;
  const allocate=api.createRetentionWindowAllocator({now:()=>at});
  const settings={batchEnabled:true,windowSeconds:8,maxItems:2};
  const a=allocate(identity,'first',true,0,settings),b=allocate(identity,'second',true,0,settings);
  assert.equal(a.id,b.id);assert.equal(a.closesAt,108);
  const c=allocate(identity,'third',true,0,settings);assert.notEqual(c.id,a.id);
  const other=allocate({...identity,peerId:'person-b',senderId:'person-b'},'x',true,0,settings);assert.notEqual(other.id,c.id);
  allocate(identity,'/new',false,0,settings);
  assert.notEqual(allocate(identity,'next',true,0,settings).id,c.id);
  at=120;assert.notEqual(allocate(identity,'later',true,0,settings).id,b.id);
});
test('window allocation excludes long inputs, explicit controls, disabled mode and changed privacy versions',()=>{
  assert.equal(typeof api.createRetentionWindowAllocator,'function');
  const allocate=api.createRetentionWindowAllocator({now:()=>100});
  const settings={batchEnabled:true};
  assert.equal(allocate(identity,'long'.repeat(1000),true,0,settings),null);
  assert.equal(allocate(identity,'command',false,0,settings),null);
  assert.equal(allocate(identity,'text',true,0,{batchEnabled:false}),null);
  assert.notEqual(allocate(identity,'a',true,0,settings).id,allocate(identity,'b',true,1,settings).id);
});
