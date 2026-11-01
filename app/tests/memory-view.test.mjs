import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../dsh-hymemory-plugin/conversation-policy.js';

const sources=Array.from({length:140},(_,i)=>({id:'source-'+String(i).padStart(3,'0'),role:i===139?'assistant':'user',actor_id:'private-actor-'+i,source_time:'2026-10-28T00:00:00Z',seq:i,start:0,end:30,state:i===139?'accepted':'received'}));
const memories=Array.from({length:6},(_,i)=>({id:'fact-'+i,content:'这是核对过的项目事实。'.repeat(40),channel:'world',source:'qqbot-dsh',meta:{namespace:'private-namespace',session_id:'private-session',evidence:{sources,current_source_id:sources.at(-1).id,privacy_version:9}}}));
function project(input=memories,options){
  assert.equal(typeof policy.projectMemoryView,'function','bounded model-facing provenance projection is missing');
  return policy.projectMemoryView(input,options);
}
test('compact projection preserves all six facts while bounding the entire serialized view',()=>{
  const r=project();
  assert.equal(r.facts.length,6);
  assert.deepEqual(r.facts.map(f=>f.content),memories.map(f=>f.content));
  assert.ok(r.serialized.length<=9000);
  assert.ok(r.serialized.length<JSON.stringify(memories).length/3);
  assert.doesNotMatch(r.serialized,/private-namespace|private-session|private-actor/);
});
test('display aliases resolve to real cited sources and retain the current original',()=>{
  const r=project();
  const table=new Map(r.sources.map(s=>[s.ref,s]));
  for(const f of r.facts){
    assert.ok(f.source_refs.length);
    assert.ok(f.source_refs.every(ref=>table.has(ref)));
    assert.ok(f.source_refs.some(ref=>table.get(ref).id==='source-139'));
    assert.equal(f.source_count,140);
    assert.equal(f.all_sources_shown,false);
  }
  assert.ok(r.sources.length<=12);
});
test('compact model view never truncates the internal deletion dependency list',()=>{
  const r=project();
  assert.deepEqual(new Set(r.sourceIds),new Set(sources.map(s=>s.id)));
  assert.equal(r.sourceIds.length,140);
});
test('legacy uncertainty survives projection and a tight budget does not mislabel completeness',()=>{
  const r=project([{...memories[0],meta:{...memories[0].meta,legacy_summary:true}}]);
  assert.equal(r.facts[0].verification,'legacy-unverified');
  const bounded=project(memories,{maxChars:2500});
  assert.ok(bounded.serialized.length<=2500);
  assert.ok(bounded.omittedFacts>0);
  assert.deepEqual(new Set(bounded.sourceIds),new Set(sources.map(s=>s.id)));
});
