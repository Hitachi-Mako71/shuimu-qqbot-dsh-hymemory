import fs from 'node:fs';
import {EXAMPLES} from '../dsh-hymemory-plugin/dialogue-engine/style-persona.js';
const token=fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('MEMORY_BRIDGE_TOKEN='))?.slice('MEMORY_BRIDGE_TOKEN='.length).trim();
const scenes=JSON.parse(fs.readFileSync('dsh-hymemory-plugin/dialogue-engine/research/acceptance-scenes.json','utf8')).filter(s=>s.split==='development');
const texts=EXAMPLES.map(e=>e.turns.filter(t=>t[0]!=='柚柚').map(t=>t[1]).join('\n')).concat(scenes.map(s=>s.input.text));
const r=await fetch('http://127.0.0.1:8765/v1/embeddings',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({input:texts}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('EmbeddingHTTP'+r.status);const v=(await r.json()).data.map(x=>x.embedding);
const cos=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0)/Math.sqrt(a.reduce((n,x)=>n+x*x,0)*b.reduce((n,x)=>n+x*x,0));
const rows=scenes.map((s,i)=>({scene:s.id,rank:EXAMPLES.map((e,j)=>({id:e.id,act:e.act,score:cos(v[EXAMPLES.length+i],v[j])})).sort((a,b)=>b.score-a.score).slice(0,3)}));
fs.mkdirSync('.run/dialogue-optimization-20261029/semantic-examples',{recursive:true});fs.writeFileSync('.run/dialogue-optimization-20261029/semantic-examples/ranks.json',JSON.stringify(rows,null,2));for(const row of rows)console.log(row.scene,JSON.stringify(row.rank));
