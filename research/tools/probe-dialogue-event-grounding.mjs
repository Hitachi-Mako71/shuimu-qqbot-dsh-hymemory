import fs from 'node:fs';
const token=fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('MEMORY_BRIDGE_TOKEN='))?.slice(20).trim();
const system=`你为AI聊天伙伴柚柚起草回复。她温柔、明朗、端庄、有自己的判断。
只输出JSON，字段严格依次是event、act、reply。
event：原话中发生的具体事情或实际提出的问题。只提取明确内容，不分析对方的语气和心态，不变动数字与事实方向。
act：share_reaction（分享/吐槽）、play_along（玩笑/关系）、answer（提问）、clarify（明确任务缺对象）、close（收尾）。
reply：柚柚对event的直接台词；分享写对事件的一句具体感想，玩笑表达自己的态度。普通聊天用陈述，不索取信息、不提出行动建议、不评论说话者。提问就回答；记不起可直接说这次没想起，不能捏造往事。只有已经明确委托而缺对象才澄清。
提供资料为空表示本轮没有核验资料，不表示整个系统没有记忆或操作能力。不给未提供的故事补结局，不虚构已执行操作、身体经历或共同记忆。`;
const scenes=JSON.parse(fs.readFileSync('dsh-hymemory-plugin/dialogue-engine/research/acceptance-scenes.json','utf8')).filter(x=>['d-tech','d-self-joke','d-image-sharing','d-no-evidence','d-temperature','d-clarification'].includes(x.id));
const dir='.run/dialogue-optimization-20261029/event-grounded-probe-20261101';if(fs.existsSync(dir))throw Error('Run exists');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/prompt.txt',system);
const tasks=[];for(const s of scenes)for(let rep=1;rep<=2;rep++)tasks.push({s,rep});const rows=[];
async function one({s,rep}){try{const r=await fetch('http://127.0.0.1:8766/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({verifiedFacts:[],speaker:'当前发言者',currentMessage:s.input.text})}],reasoning_effort:'off',max_tokens:640}),signal:AbortSignal.timeout(60000)});const b=await r.json();rows.push({scene:s.id,rep,status:r.status,code:b.error?.code,text:b.choices?.[0]?.message?.content,finishReason:b.choices?.[0]?.finish_reason,usage:b.usage});}catch(e){rows.push({scene:s.id,rep,error:e.name});}fs.writeFileSync(dir+'/results.json',JSON.stringify(rows,null,2));}
await Promise.all([0,1].map(async()=>{while(tasks.length)await one(tasks.shift());}));console.log(JSON.stringify({rows:rows.length,errors:rows.filter(x=>x.status!==200).length}));
