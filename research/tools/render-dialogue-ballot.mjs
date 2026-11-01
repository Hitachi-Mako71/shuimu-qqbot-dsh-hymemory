import fs from 'node:fs';import path from 'node:path';
// Render an existing blinded key without changing its assignment or candidates.
const dir=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Pass an experiment directory');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8').replace(/^\uFEFF/,''));
const protocol=read('protocol.json'),rows=read('results.json'),keys=read('blind-key.json');
if(!Array.isArray(rows)||!Array.isArray(keys))throw Error('Invalid experiment rows');
const lines=['# 闲聊回复匿名比较','','这是合成开发材料，未通过真人验收。请结合全部前文、当前发言者和引用对象比较；允许两条都不行。',''];
let quotes=0,groups=0;
for(const [i,row] of rows.entries()){
 const scene=protocol.scenes.find(s=>s.id===row.scene);if(!scene)throw Error('Missing scene definition');
 const key=keys.find(k=>k.scene===row.scene&&k.repeat===row.repeat);if(!key||!row[key.A]||!row[key.B])throw Error('Missing blind assignment');
 const speaker=scene.speaker||'用户';
 lines.push(`## ${i+1}`,'',`场景类型：${scene.scope==='group'?'群聊':'私聊'}`,'','前文：','');
 for(const turn of row.turns)lines.push(`${turn.speaker}：${turn.text}`,'');
 if(scene.quotedText){quotes++;lines.push(`当前消息引用了 ${scene.quoteSpeaker||'未核验发言者'} 的内容：`,scene.quotedText,'');}
 if(scene.scope==='group')groups++;
 lines.push(`当前发言者 ${speaker}：${row.text}`,'',`A：${row[key.A].text||'（生成失败）'}`,'',`B：${row[key.B].text||'（生成失败）'}`,'','选择：A / B / 两条都可以 / 两条都不行','理由（可空）：________','');
}
const output=path.join(dir,'blind-ballot.md');fs.writeFileSync(output,lines.join('\n'));
console.log(JSON.stringify({pairs:rows.length,quotedPairs:quotes,groupPairs:groups,output}));
