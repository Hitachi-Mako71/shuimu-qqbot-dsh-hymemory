// Model-facing projection only. Full provenance remains in the original stores
// and sourceIds below; this view must never be used to compute deletion closure.
export function evidenceSourceIds(value) {
  const ids=new Set();
  const visit=v=>{if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object'){
    for(const s of v.evidence?.sources||[])if(typeof s.id==='string')ids.add(s.id);
    for(const k of ['meta','custom','client_meta'])if(v[k])visit(v[k]);
  }};
  visit(value);return [...ids];
}
function evidence(value) {
  if(!value||typeof value!=='object')return null;
  if(Array.isArray(value.evidence?.sources))return value.evidence;
  for(const key of ['meta','custom','client_meta']){const found=evidence(value[key]);if(found)return found;}
  return null;
}
export function projectMemoryView(memories=[],{maxChars=9000}={}) {
  maxChars=Number.isInteger(maxChars)?Math.max(512,Math.min(maxChars,20000)):9000;
  const sourceIds=evidenceSourceIds(memories),catalog=new Map();
  const selected=memories.slice(0,6).map(m=>{
    const e=evidence(m),all=[...new Map((e?.sources||[]).filter(s=>s&&typeof s.id==='string'&&s.id.length<=128).map(s=>[s.id,s])).values()];
    for(const s of all){
      const role=['user','assistant'].includes(s.role)?s.role:'unknown';
      const old=catalog.get(s.id);
      catalog.set(s.id,{id:s.id,role:old&&old.role!==role?'unknown':role});
    }
    const primary=all.find(s=>s.id===e?.current_source_id)||all.at(-1);
    const user=all.findLast(s=>s.role==='user');
    const refs=[...new Set([primary?.id,user?.id].filter(Boolean))];
    return {id:String(m.id||'').slice(0,128),content:String(m.content||''),kind:m.channel||'world',
      verification:m.meta?.legacy_summary?'legacy-unverified':all.length?'source-referenced':'unverified',
      refs,source_count:all.length};
  });
  let omittedFacts=Math.max(0,memories.length-selected.length);
  function build(){
    const aliases=new Map(),sources=[];
    const facts=selected.map(({refs,...fact})=>{
      const source_refs=refs.map(id=>{
        if(!aliases.has(id)){const ref='s'+(aliases.size+1);aliases.set(id,ref);sources.push({ref,...catalog.get(id)});}
        return aliases.get(id);
      });
      return {...fact,source_refs,all_sources_shown:refs.length===fact.source_count};
    });
    return {facts,sources,serialized:JSON.stringify({facts,sources,omitted_facts:omittedFacts})};
  }
  let built=build();
  // Prefer preserving fact text over optional additional displayed pointers.
  for(let i=selected.length-1;built.serialized.length>maxChars&&i>=0;i--){
    if(selected[i].refs.length>1){selected[i].refs=selected[i].refs.slice(0,1);built=build();}
  }
  while(built.serialized.length>maxChars&&selected.length){selected.pop();omittedFacts++;built=build();}
  return {...built,sourceIds,omittedFacts};
}
