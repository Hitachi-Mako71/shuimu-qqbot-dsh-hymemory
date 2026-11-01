import fs from 'node:fs';
const token=fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('MEMORY_BRIDGE_TOKEN='))?.slice(20).trim();
const system=`你是柚柚，明朗、温柔、端庄，有自己的好恶和判断，是AI伙伴。和熟悉的人闲聊时，直接表达对事情的态度，一两句短陈述。对方明确求助就认真作答；缺实际任务对象才问。保留事实、数字与不确定性，共同经历只依据本轮资料。
下面是虚构的风格对照，不是共同经历：
对方：电脑一直转圈，我连饭都吃完了。
不合适：你的耐心真不错。先检查CPU占用？
合适：饭都吃完了它还在转，真磨人。
对方：刚做完的东西一下子全被改了，气笑了。
不合适：还能笑出来，心态挺好的。
合适：辛辛苦苦做完，就这么全变了。换我也不高兴。
对方：[分享台词：她只想回家时有人说欢迎回来]
不合适：这句话体现了角色对归属感的渴望。
合适：想让她被好好迎接一次。
对方：你想起上次我最喜欢的角色了吗？[本轮无相关资料]
不合适：请再提供剧情背景。
合适：这次没想起来。
对方：这段代码为什么循环不退出？[提供了代码]
合适：直接指出对应代码的问题，保留必要解释。
现在只回复下面的当前消息。`;
const scenes=JSON.parse(fs.readFileSync('dsh-hymemory-plugin/dialogue-engine/research/acceptance-scenes.json','utf8')).filter(x=>['d-tech','d-self-joke','d-image-sharing','d-no-evidence','d-temperature','d-clarification'].includes(x.id));
const dir='.run/dialogue-optimization-20261029/contrastive-probe-20261101';if(fs.existsSync(dir))throw Error('Run exists');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/prompt.txt',system);
const tasks=[];for(const s of scenes)for(let rep=1;rep<=2;rep++)tasks.push({s,rep});const rows=[];
async function one({s,rep}){try{const r=await fetch('http://127.0.0.1:8766/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:system},{role:'user',content:s.input.text}],reasoning_effort:'off',max_tokens:640}),signal:AbortSignal.timeout(60000)});const b=await r.json();rows.push({scene:s.id,rep,status:r.status,code:b.error?.code,text:b.choices?.[0]?.message?.content,finishReason:b.choices?.[0]?.finish_reason,usage:b.usage});}catch(e){rows.push({scene:s.id,rep,error:e.name});}fs.writeFileSync(dir+'/results.json',JSON.stringify(rows,null,2));}
await Promise.all([0,1].map(async()=>{while(tasks.length)await one(tasks.shift());}));console.log(JSON.stringify({rows:rows.length,errors:rows.filter(x=>x.status!==200).length}));
