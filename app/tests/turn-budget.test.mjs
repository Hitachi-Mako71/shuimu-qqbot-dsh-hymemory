import test from 'node:test';
import assert from 'node:assert/strict';
let api={};try{api=await import('../dsh-hymemory-plugin/turn-budget.js');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
function fixture(overrides={}){
  assert.equal(typeof api.createTurnBudget,'function','QQ turn budget is missing');
  let at=0,timer,cleared=false;
  const abort=new AbortController();
  const agent={cancel:()=>abort.abort('budget-limit')};
  const budget=api.createTurnBudget(agent,{maxModelRequests:2,maxToolCalls:3,maxMs:100,maxRepeatedFailures:2,...overrides},
    {now:()=>at,schedule:fn=>{timer=fn;return {unref(){}};},unschedule:()=>{cleared=true;}});
  return {budget,abort,advance:ms=>{at=ms;},fire:()=>timer(),cleared:()=>cleared};
}
test('model request limit cancels the owning agent before another provider call',()=>{
  const f=fixture();f.budget.modelRequest();f.budget.modelRequest();
  assert.throws(()=>f.budget.modelRequest(),/QQTurnLimit/);assert.equal(f.abort.signal.aborted,true);
});
test('tool attempt limit counts nested invocations too',()=>{
  const f=fixture({maxToolCalls:2});
  f.budget.beforeTool({name:'run_code',arguments:{},callId:'outer'});
  f.budget.beforeTool({name:'read',arguments:{path:'fixture'},callId:'nested'});
  assert.throws(()=>f.budget.beforeTool({name:'read',arguments:{path:'other'},callId:'later'}),/QQTurnLimit/);
  assert.equal(f.abort.signal.aborted,true);
});
test('same failed tool result triggers the no-progress breaker; changed or successful results reset it',()=>{
  const f=fixture({maxToolCalls:20});
  const exec={name:'read',arguments:{path:'fixture'}};
  f.budget.beforeTool(exec);f.budget.afterTool(exec,{isError:true,error:{code:'A'}});
  f.budget.beforeTool(exec);f.budget.afterTool(exec,{isError:true,error:{code:'B'}});
  assert.equal(f.abort.signal.aborted,false);
  f.budget.beforeTool(exec);f.budget.afterTool(exec,{isError:false,content:[]});
  f.budget.beforeTool(exec);f.budget.afterTool(exec,{isError:true,error:{code:'A'}});
  assert.equal(f.abort.signal.aborted,false);
  f.budget.beforeTool(exec);f.budget.afterTool(exec,{isError:true,error:{code:'A'}});
  assert.equal(f.abort.signal.aborted,true);
});
test('wall deadline aborts an in-flight operation, not just a waiting Promise',async()=>{
  const f=fixture();
  const operation=new Promise(resolve=>f.abort.signal.addEventListener('abort',()=>resolve('actually-stopped'),{once:true}));
  f.advance(101);f.fire();
  assert.equal(await operation,'actually-stopped');assert.throws(()=>f.budget.assertDelivery(),/QQTurnLimit/);
});
test('completed turn clears its watchdog but still rejects delivery after its deadline',()=>{
  const f=fixture();f.budget.finish();assert.equal(f.cleared(),true);
  f.budget.assertDelivery();f.advance(101);assert.throws(()=>f.budget.assertDelivery(),/QQTurnLimit/);
});
test('late results from an old turn cannot cancel a newer active turn',()=>{
  let current=true,cancels=0;
  assert.equal(typeof api.createTurnBudget,'function');
  const b=api.createTurnBudget({cancel:()=>cancels++},{maxMs:1000,maxModelRequests:1,maxToolCalls:3,maxRepeatedFailures:1},
    {isCurrent:()=>current,schedule:()=>({unref(){}}),unschedule:()=>{}});
  b.beforeTool({name:'read',arguments:{}});current=false;b.afterTool({name:'read',arguments:{}},{isError:true,error:{code:'NO'}});
  assert.equal(cancels,0);assert.throws(()=>b.assertDelivery(),/QQTurnLimit/);
});
