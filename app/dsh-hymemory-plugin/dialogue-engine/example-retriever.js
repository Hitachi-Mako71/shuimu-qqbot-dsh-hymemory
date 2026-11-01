import {EXAMPLES} from './style-persona.js';
const norm=v=>Math.sqrt(v.reduce((sum,x)=>sum+x*x,0));
export function createExampleSelector({embed,examples=EXAMPLES,minSimilarity=0.45,topK=2}={}){
  if(typeof embed!=='function')throw Error('ExampleEmbeddingRequired');
  let publicVectors;
  const texts=examples.map(e=>e.retrievalText||e.turns.filter(t=>t[0]!=='柚柚').map(t=>t[1]).join('\n'));
  const validate=values=>{
    if(!Array.isArray(values)||values.some(v=>!Array.isArray(v)||!v.length||v.some(x=>!Number.isFinite(x))||norm(v)===0))throw Error('ExampleEmbeddingInvalid');
    return values;
  };
  return async function select(turn,{signal}={}){
    signal?.throwIfAborted();
    // Cache only embeddings of the finite public authored catalogue, never a
    // user's utterance, vector, history, identity or private relationship state.
    publicVectors ||= Promise.resolve().then(()=>embed(texts,{signal})).then(validate).then(v=>{if(v.length!==texts.length)throw Error('ExampleCorpusSizeMismatch');return v;}).catch(e=>{publicVectors=undefined;throw e;});
    const corpus=await publicVectors;
    const [query]=validate(await embed([String(turn.text||'').slice(0,1400)],{signal}));
    signal?.throwIfAborted();
    if(corpus.some(v=>v.length!==query.length))throw Error('ExampleEmbeddingDimensionMismatch');
    return corpus.map((v,i)=>({id:examples[i].id,score:v.reduce((n,x,j)=>n+x*query[j],0)/(norm(v)*norm(query))}))
      .filter(r=>r.score>=minSimilarity).sort((a,b)=>b.score-a.score).slice(0,Math.min(3,topK)).map(r=>r.id);
  };
}
