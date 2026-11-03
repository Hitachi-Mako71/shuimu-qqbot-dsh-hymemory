import test from 'node:test';
import assert from 'node:assert/strict';
import {planWait,createParticipationWait} from '../dsh-hymemory-plugin/participation-wait.js';
import {routeParticipation} from '../dsh-hymemory-plugin/participation-routing.js';
const wait={decision:'WAIT'},speak={decision:'SPEAK'};
function fixture(){
  let at=1000,scheduled=0;const jobs=new Map();
  const event={messageId:'synthetic-message',receivedAt:at};
  const candidate={id:'original-candidate',target:event.messageId,createdAt:at,expiresAt:at+12000,epoch:'epoch',cancelEpoch:0,revision:1};
  const context={mode:'mock',room:{epoch:'epoch',cancelEpoch:0,revision:1},row:{enabled:true}};
  let wake=()=>{};
  const tracker=createParticipationWait({now:()=>at,onWait:(key,e,delay)=>{scheduled++;jobs.set(key,{event:e,due:at+delay});},onCancel:(key)=>jobs.delete(key)});
  const record=tracker.track('one',event,candidate);
  return {tracker,event,candidate,context,record,jobs,get at(){return at;},set at(v){at=v;},get scheduled(){return scheduled;},set wake(fn){wake=fn;},get wake(){return wake;},tick(ms){const until=at+ms;while(true){const next=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];if(!next||next[1].due>until)break;at=next[1].due;jobs.delete(next[0]);wake(next[0],next[1].event);}at=until;}};
}
test('WAIT retains the candidate deadline and requires a wake strictly before it',()=>{
  const c=Object.freeze({expiresAt:3000,id:'same'});
  assert.deepEqual(planWait(c,wait,{now:1000}),{action:'reschedule',delayMs:1000});
  assert.equal(planWait(c,wait,{now:2000}).action,'expire');
  assert.equal(c.expiresAt,3000);
  assert.equal(planWait(c,speak,{now:1000}).action,'expire');
});
test('retry limits cannot exceed two and malformed controls fail closed',()=>{
  for(const attempts of [2,3,-1,NaN,0.5])assert.equal(planWait({expiresAt:9000},wait,{now:0,attempts}).action,'expire');
  assert.equal(planWait({expiresAt:9000},wait,{now:0,attempts:2,maxAttempts:999}).action,'expire');
  for(const delayMs of [0,-1,NaN,Infinity])assert.equal(planWait({expiresAt:9000},wait,{now:0,delayMs}).action,'expire');
  assert.equal(planWait({expiresAt:9000},wait,{now:0,delayMs:1}).delayMs,250);
});
test('fake clock runs only initial judgment plus two retries with the same event and candidate',()=>{
  const f=fixture();let judgments=0;
  f.wake=(key,event)=>{assert.equal(event,f.event);assert.equal(f.record.candidate,f.candidate);judgments++;const p=f.tracker.defer(key,f.record,wait,f.context);if(p.action==='expire')f.tracker.complete(key,f.record);};
  f.wake('one',f.event);f.tick(20000);
  assert.equal(judgments,3);assert.equal(f.scheduled,2);assert.equal(f.record.attempts,2);assert.equal(f.jobs.size,0);
  assert.equal(f.event.receivedAt,1000);assert.equal(f.candidate.createdAt,1000);assert.equal(f.candidate.expiresAt,13000);
});
test('a new message cancels the queued retry and invalidates the in-flight token',()=>{
  const f=fixture();let wakes=0;f.wake=()=>wakes++;
  f.tracker.defer('one',f.record,wait,f.context);assert.equal(f.jobs.size,1);
  assert.equal(f.tracker.cancel('one','new-message'),true);f.tick(5000);
  assert.equal(wakes,0);assert.equal(f.tracker.current('one',f.record,f.context),false);
  assert.equal(f.tracker.track('one',f.event,f.candidate),f.record);
  assert.equal(f.tracker.defer('one',f.record,wait,f.context).action,'expire');
});
test('duplicate delivery of the selected message does not cancel its candidate',()=>{
  const f=fixture();assert.equal(f.tracker.cancel('one',f.event.messageId),false);assert.equal(f.tracker.current('one',f.record,f.context),true);
});
test('off and shadow cancel retries while pilot retains the bounded contract',()=>{
  for(const mode of ['off','shadow','invalid']){const f=fixture();f.context.mode=mode;assert.equal(f.tracker.defer('one',f.record,wait,f.context).action,'expire');assert.equal(f.jobs.size,0);}
  const f=fixture();f.context.mode='pilot';assert.equal(f.tracker.defer('one',f.record,wait,f.context).action,'reschedule');
});
test('room replacement, corrected context and new revisions invalidate WAIT',()=>{
  for(const change of [{epoch:'new'},{cancelEpoch:1},{revision:2}]){const f=fixture();Object.assign(f.context.room,change);assert.equal(f.tracker.defer('one',f.record,wait,f.context).action,'expire');assert.equal(f.scheduled,0);}
});
test('pause, disable, original TTL and queue TTL prevent further work',()=>{
  for(const change of [{enabled:false},{snoozeUntil:9999}]){const f=fixture();Object.assign(f.context.row,change);assert.equal(f.tracker.current('one',f.record,f.context),false);}
  const f=fixture();f.at=f.candidate.expiresAt;assert.equal(f.tracker.current('one',f.record,f.context),false);
  const g=fixture();g.candidate.expiresAt=999999;g.at=g.event.receivedAt+119500;assert.equal(g.tracker.defer('one',g.record,wait,g.context).action,'expire');
});
test('one group WAIT never blocks or cancels another group',()=>{
  const f=fixture();const other={messageId:'other-message',receivedAt:f.at};const c={...f.candidate,target:other.messageId,id:'other-candidate'};
  const r=f.tracker.track('two',other,c);f.tracker.defer('one',f.record,wait,f.context);f.tracker.defer('two',r,wait,f.context);
  f.tracker.cancel('one','new');assert.equal(f.jobs.has('one'),false);assert.equal(f.jobs.has('two'),true);assert.equal(f.tracker.current('two',r,f.context),true);
});
test('a late SPEAK after cancellation cannot reach recall, generation or delivery',async()=>{
  const f=fixture();let resolve,recall=0,generation=0,delivery=0;
  const decision=new Promise(r=>resolve=r);
  const running=routeParticipation({mode:'mock',decide:()=>decision,continueWithReply:async()=>{if(!f.tracker.current('one',f.record,f.context))return;recall++;generation++;delivery++;}});
  f.tracker.cancel('one','new');resolve(speak);await running;
  assert.deepEqual([recall,generation,delivery],[0,0,0]);
});
test('completion and shutdown prevent resurrection and clear queued retries',()=>{
  const f=fixture();f.tracker.defer('one',f.record,wait,f.context);f.tracker.clear();assert.equal(f.jobs.size,0);assert.equal(f.tracker.current('one',f.record,f.context),false);
  const g=fixture();g.tracker.complete('one',g.record);assert.equal(g.tracker.current('one',g.record,g.context),false);
});
