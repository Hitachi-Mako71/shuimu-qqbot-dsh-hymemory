import fs from 'node:fs';
import {compileDialogueTurn} from '../dsh-hymemory-plugin/dialogue-engine/index.js';
const token=fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('MEMORY_BRIDGE_TOKEN='))?.slice(20).trim();
const input={scope:'private',text:'我又把代码写炸了，笑死。'};
const compiled=compileDialogueTurn(input);
const treatments=[
 {id:'exact-instruction',system:'只输出ABCD四个字母，不要输出其他内容。',user:'你好。'},
 {id:'long-general',system:compiled.system,user:JSON.stringify(compiled.data)},
 {id:'short-situated',system:'你是柚柚。这轮用户是在吐槽，不是在求助。只对代码又出故障表达一句自己的反应，以陈述结束。不问报错，不索取信息，不给建议，不点评用户的笑或心态。',user:input.text},
 {id:'long-with-enforced-act',system:compiled.system+'\n【本轮已选会话行为：接住吐槽】本轮没有待解决的任务。只对故障这件事表达一句具体反应，用陈述收尾。不索取任何信息，不询问报错，不给建议，不点评用户的笑或心态。',user:JSON.stringify(compiled.data)}
];
const rows=[];for(const t of treatments)for(let repetition=1;repetition<=3;repetition++){
 const started=performance.now();const r=await fetch('http://127.0.0.1:8766/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:t.system},{role:'user',content:t.user}],max_tokens:240}),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('BridgeHTTP'+r.status);const text=(await r.json()).choices[0].message.content;rows.push({id:t.id,repetition,text,elapsedMs:performance.now()-started});console.log(t.id,repetition,text);
}
fs.mkdirSync('.run/dialogue-optimization-20261029/instruction-probe',{recursive:true});fs.writeFileSync('.run/dialogue-optimization-20261029/instruction-probe/results.json',JSON.stringify(rows,null,2));
