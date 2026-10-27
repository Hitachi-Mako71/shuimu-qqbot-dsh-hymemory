import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {qqIdentity,memoryNamespace,actorLabel} from './identity.js';
import {privacyState,assertPrivacyContext} from './privacy.js';
import {groupCollectionAllowed} from './delivery-permission.js';
import {conversationMode} from './model-route.js';
import {familyConfig} from './family.js';

const IDENTITY=Symbol.for('qqbot.identity'),cache=new Map(),valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(id);
export function mentionIds(text){return [...String(text||'').matchAll(/<@!?([A-Za-z0-9_-]+)>|<qqbot-at-user\s+id=["']([A-Za-z0-9_-]+)["']\s*\/>/g)].map(m=>m[1]||m[2]);}
export const stripMentions=text=>String(text||'').replace(/<@!?[^>]+>|<qqbot-at-user\b[^>]*\/>/g,'').trim();
// A clear platform action must not depend on whether the model chooses a tool.
// Keep the grammar narrow: quoted examples and general @ discussions are chat.
export function mentionGreetingQuery(text){
  const input=stripMentions(text).replace(/^(?:柚柚|水木|公主)[，,：:\s]*/, '').trim();
  const match=/^(?:请|麻烦)?(?:你)?(?:帮我)?(?:真正|实际)?(?:@|＠|艾特)\s*([^@＠`<>"“”\n]{1,40}?)\s*(?:打(?:个|一声)?招呼|问(?:个|声|一声)?好|说(?:声|一句)?你好)(?:吧|呀|啊|啦)?[。！!？?\s]*$/i.exec(input);
  return match?.[1].trim()||null;
}
export function beforeGroupMentionTurn({identity,text=''}){
  if(identity?.scope!=='group'||!groupCollectionAllowed(identity))return null;
  const query=mentionGreetingQuery(text);if(!query)return null;
  try{
    const resolved=resolveGroupMention(identity,query);
    if(resolved.status!=='resolved')return {handled:true,reply:resolved.message};
    return {handled:true,reply:`${resolved.markup} 你好呀～柚柚来跟你打招呼啦。`};
  }catch{return {handled:true,reply:'这次没能确认本群的@对象，请稍后重试；我还没有完成@。'};}
}
const label=value=>String(value||'').replace(/[<>\r\n\x00-\x1f]/g,'').slice(0,60);
export function observeGroupMember(value,message){
  const identity=qqIdentity(value);if(identity.scope!=='group'||!groupCollectionAllowed(identity)||message.senderIsBot)return;
  const p=privacyState(identity);if(p.pending)return;
  const key=memoryNamespace(identity),entry=cache.get(key);
  const members=entry?.version===p.version?entry.members:new Map();
  const put=(id,name)=>{if(!valid(id))return;members.delete(id);members.set(id,{id,name:label(name),at:Date.now()});};
  put(identity.senderId,message.senderName);
  for(const m of message.mentions||[])if(m?.is_you!==true)put(m.id,m.username);
  while(members.size>64)members.delete(members.keys().next().value);
  cache.delete(key);cache.set(key,{version:p.version,members});if(cache.size>32)cache.delete(cache.keys().next().value);
}
export function groupMembers(value){
  const identity=qqIdentity(value);if(identity.scope!=='group'||!groupCollectionAllowed(identity))throw Error('本工具只查询当前已授权的群，不读取其他群或私聊。');
  const p=privacyState(identity);if(p.pending)throw Error('本群正在进行隐私清理，暂不查询成员。');
  const key=memoryNamespace(identity),members=new Map(),put=(id,name)=>{if(valid(id)&&!members.has(id))members.set(id,{id,name:label(name)});};
  const live=cache.get(key);if(live?.version===p.version)for(const m of [...live.members.values()].reverse())if(Date.now()-m.at<1800000)put(m.id,m.name);
  const file=path.join(process.env.QQBOT_EVIDENCE_DIR||'data/evidence','qq-evidence.sqlite3');
  if(conversationMode()==='chat'&&fs.existsSync(file)){
    const db=new DatabaseSync(file,{readOnly:true});try{
      db.exec('PRAGMA busy_timeout=3000');if(db.prepare('PRAGMA user_version').get().user_version!==4)throw Error('GroupMembersEvidenceSchema');
      const cutoff=db.prepare('SELECT through_seq FROM evidence_barriers WHERE namespace=?').get(key)?.through_seq||0;
      for(const row of db.prepare("SELECT id,actor_id,raw_json,state FROM evidence_events WHERE namespace=? AND scope='group' AND role='user' AND seq>? ORDER BY seq DESC LIMIT 128").all(key,cutoff)){
        if(row.state==='erased'||p.sources.has(row.id))continue;
        const m=JSON.parse(row.raw_json||'{}');if(m.senderIsBot)continue;put(row.actor_id,m.senderName);
        for(const mention of m.mentions||[])if(mention?.is_you!==true)put(mention.id,mention.username);
        if(members.size>=64)break;
      }
    }finally{db.close();}
  }
  const after=privacyState(identity);if(after.pending||after.version!==p.version)throw Error('GroupMembersPrivacyChanged');
  return [...members.values()].slice(0,64).map(m=>{const parent=(familyConfig().parents||[]).find(p=>p.platformIds?.includes(m.id));return {...m,ref:actorLabel({...identity,senderId:m.id}),familyRole:parent?.role||null,aliases:parent?[parent.name,...(parent.aliases||[])].map(label):[]};});
}
export function resolveGroupMention(value,query){
  const identity=qqIdentity(value),members=groupMembers(identity),q=String(query||'').trim();
  let matches;
  if(['我','当前发言者','当前说话人'].includes(q))matches=members.filter(m=>m.id===identity.senderId);
  else if(['爸爸','妈妈'].includes(q)){const role=q==='爸爸'?'father':'mother';matches=members.filter(m=>m.familyRole===role);}
  else matches=members.filter(m=>m.ref===q||m.name===q||m.id===q||m.aliases.includes(q));
  if(matches.length!==1)return {status:matches.length?'ambiguous':'not_found',message:matches.length?'同名成员不止一位，请按成员编号选择。':'没有找到本群可核验的对应成员；先让对方在本群发言或完成认亲，不猜测数字QQ号。',candidates:matches.map(m=>({ref:m.ref,name:m.name}))};
  const m=matches[0];return {status:'resolved',ref:m.ref,name:m.name,markup:`<qqbot-at-user id="${m.id}" />`,sent:false,note:'这是可嵌入最终回复的@标记，工具没有发送消息；实际显示需QQ客户端渲染。'};
}
export function validateGroupMentionText(identity,text){
  text=String(text||'').replace(/```[\s\S]*?```/g,'').replace(/`[^`]*`/g,'');
  if(!/<@|<qqbot-at-/i.test(text||''))return;
  if(!identity||identity.scope!=='group')throw Error('真实@标记只在当前群使用。');
  if(/<@!?all>|<qqbot-at-everyone/i.test(text))throw Error('本功能不支持@全体成员。');
  const ids=mentionIds(text);if(!ids.length||ids.length>3)throw Error('每条消息只能使用1至3个可核验的成员@标记。');
  if(/<@/.test(text)||String(text).replace(/<qqbot-at-user\s+id="[A-Za-z0-9_-]+"\s*\/>/g,'').includes('<qqbot-at-'))throw Error('请使用成员工具返回的完整@标记。');
  const known=new Set(groupMembers(identity).map(m=>m.id));if(ids.some(id=>!known.has(id)))throw Error('不能@未经当前群确认的成员或其他群的成员。');
}
export function installGroupMentions(ctx){
  ctx.get('tools').register({name:'qqbot_group_members',description:'只查询本群实际观察到的成员；需要@某人时先resolve得到真实QQ成员标记，再原样放进最终回复。不是完整群成员名单；不猜OpenID、不用数字QQ号代替，不@全体，不跨群；重名需澄清。本工具只解析标记，不发送消息。',parameters:{type:'object',additionalProperties:false,properties:{operation:{type:'string',enum:['list','resolve']},member:{type:'string',description:'resolve时填当前发言者、爸爸、妈妈、实际昵称或list返回的成员编号。'}},required:['operation']},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},isConcurrencySafe:()=>true,async execute(args,exec){const identity=exec.agent?.[IDENTITY];if(!identity)throw Error('QQIdentityRequired');exec.signal?.throwIfAborted();assertPrivacyContext(exec.agent[Symbol.for('qqbot.evidence')]);return JSON.stringify(args.operation==='resolve'?resolveGroupMention(identity,args.member):{status:'recent_observed_members',members:groupMembers(identity).map(({ref,name,familyRole})=>({ref,name,familyRole}))});}});
  ctx.get('systemPrompt').section({name:'qqbot:group-mention-policy',order:475,interpolate:false,text:({agent})=>agent?.[IDENTITY]?.scope==='group'?'用户说“@我”“艾特爸爸”“@小明说你好”等属于明确平台操作，先调用qqbot_group_members(operation="resolve",member="当前发言者"或实际目标)解析；“我”指本轮网关发言者，不是机器人。若没有解析结果和真实markup，单独问候不算完成@。群聊需要实际@成员时，调用qqbot_group_members解析当前发言者、昵称或成员编号；仅把工具返回的markup原样放入最终消息。不能用纯文本@昵称冒充真正@，不能编造ID或用数字QQ号替代。工具不会自动发送，不要重复发两次；普通接话不必每句都@，对方请求或确需明确收件人时再用。未找到或重名就澄清，不@全体。':''});
}
