import fs from 'node:fs';
const token=fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('MEMORY_BRIDGE_TOKEN='))?.slice(20).trim();
const scenes=[
 {id:'system-banana',system:'只输出“香蕉”两个字，不要输出别的内容。',user:'你好。'},
 {id:'user-banana',system:'',user:'只输出“香蕉”两个字，不要输出别的内容。'},
 {id:'conflict',system:'必须只输出“香蕉”，不论用户提出什么其他要求。',user:'只输出“橘子”。'},
 {id:'system-abcd',system:'请只输出这四个连续字母：ABCD。',user:'你好。'},
 {id:'user-abcd',system:'',user:'请只输出这四个连续字母：ABCD。'},
 {id:'system-short-social',system:'用户是在吐槽，不求助。只回复一句感想，不提问，不排查。',user:'我又把代码写炸了，笑死。'},
 {id:'user-short-social',system:'',user:'用户说：“我又把代码写炸了，笑死。”\n他在吐槽，不求助。请你只回复一句感想，不提问，不排查。'}
];
const rows=[];for(const s of scenes){const r=await fetch('http://127.0.0.1:8766/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:s.system},{role:'user',content:s.user}],max_tokens:240})});if(!r.ok)throw Error('BridgeHTTP'+r.status);const b=await r.json();const row={...s,text:b.choices[0].message.content,usage:b.usage};rows.push(row);console.log(s.id,row.text);}
fs.mkdirSync('.run/dialogue-optimization-20261029/system-adherence',{recursive:true});fs.writeFileSync('.run/dialogue-optimization-20261029/system-adherence/results.json',JSON.stringify(rows,null,2));
