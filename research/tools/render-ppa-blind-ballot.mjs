import fs from 'node:fs';
import path from 'node:path';
const tag=process.argv[2]||'';
if(!/^[a-z0-9-]{1,50}$/.test(tag))throw Error('Expected run tag');
const dir=path.resolve('.run/dialogue-optimization-20261029',tag);
const rows=fs.readFileSync(path.join(dir,'blinded-candidates.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const utterances={'tech-vent':'我又把代码写炸了，笑死。','ticket-loss':'抢了半天票，付款那下没了。','line-sharing':'这句台词真难受：她想要的只是普通的明天。'};
const calls=JSON.parse(fs.readFileSync(path.join(dir,'call-metadata.json'),'utf8'));
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)]??0;};
const cost=Object.fromEntries([...new Set(calls.map(c=>c.arm))].map(arm=>{
  const subset=calls.filter(c=>c.arm===arm),latencies=subset.map(c=>c.elapsedMs),perReply=new Map();
  for(const call of subset){const id=`${call.scene}:${call.rep}`,previous=perReply.get(id)||{elapsedMs:0,totalTokens:0};previous.elapsedMs+=call.elapsedMs;previous.totalTokens+=call.usage?.total_tokens||0;perReply.set(id,previous);}
  const replies=[...perReply.values()];
  return [arm,{calls:subset.length,replies:replies.length,totalTokens:subset.reduce((sum,c)=>sum+(c.usage?.total_tokens||0),0),tokensPerReply:{median:percentile(replies.map(r=>r.totalTokens),.5),p95:percentile(replies.map(r=>r.totalTokens),.95)},apiCallLatencyMs:{median:percentile(latencies,.5),p95:percentile(latencies,.95)},replyLatencyMs:{median:percentile(replies.map(r=>r.elapsedMs),.5),p95:percentile(replies.map(r=>r.elapsedMs),.95)}}];
}));
const lines=[
  '# 盲化回复比较表',
  '',
  '每组请选择：A更合适 / B更合适 / 两条都可以 / 两条都不行。主要看是否接住当下的话、自然不自然、有没有多余追问或客服腔。短不自动代表好；明显事实错误或把闲聊变工单请标“都不行”。',
  '',
];
for(const row of rows){
  lines.push(`## ${row.scene}（第${row.rep}次）`,'',`场景：${row.utterance||utterances[row.scene]||'（缺少场景文本）'}`,`检查重点：${row.criteria}`,'',`**A**：${row.A.text||'（生成失败）'}`,'',`**B**：${row.B.text||'（生成失败）'}`,'','选择：________　简短理由（可空）：________','');
}
fs.writeFileSync(path.join(dir,'blind-ballot.md'),lines.join('\n'),'utf8');
fs.writeFileSync(path.join(dir,'cost-summary.json'),JSON.stringify({status:'descriptive_costs_not_quality_scores',arms:cost},null,2));
console.log(path.join(dir,'blind-ballot.md'));
