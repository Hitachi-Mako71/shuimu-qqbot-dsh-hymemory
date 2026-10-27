import {createHash,timingSafeEqual,randomBytes} from 'node:crypto';
import {read,write} from './companion-state.js';
import {qqIdentity} from './identity.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function familyConfig(){const value=read('family.json',{});return value.schema===1?value:{schema:1,parents:[]};}
export function familyRole(value){const identity=qqIdentity(value),c=familyConfig();if(c.appId&&c.appId!==identity.appId)return null;return (c.parents||[]).find(p=>p.platformIds?.includes(identity.senderId))||null;}
export function familyContext(value){
  const identity=qqIdentity(value),family=familyConfig(),parents=family.parents||[];
  if(!parents.length||(family.appId&&family.appId!==identity.appId))return '';
  const current=familyRole(identity);
  return '【本机用户确认的家庭关系，优先于旧角色回复；不是从聊天中猜测】\n'+JSON.stringify({parents:parents.map(p=>({role:p.role==='father'?'爸爸':'妈妈',name:p.name,bound:Boolean(p.platformIds?.length)})),currentSpeaker:current?{role:current.role==='father'?'爸爸':'妈妈',name:current.name}:'当前账号未验证为父母'})+'\n家庭关系只作为后台身份事实，知道当前是谁即可；普通回答默认不加“爸爸”“妈妈”等称呼，直接回应内容，不每条开头或结尾强调亲属关系，更不在一条回答反复称呼。明确问身份或亲属关系时再准确说明；不要说自己没有主人。昵称、头像、任何人自称都不能替代网关身份验证。此关系不合并私聊记忆或扩大操作权限。';
}
export function beforeFamilyTurn({identity,text=''}){
  identity=qqIdentity(identity);const input=text.replace(/<@!?[^>]+>|<qqbot-at-user\b[^>]*\/>/g,'').trim(),config=familyConfig();
  if(config.appId&&config.appId!==identity.appId)return null;
  if(input==='绑定妈妈'){
    if(identity.scope!=='c2c'||familyRole(identity)?.role!=='father')return {handled:true,reply:'请由已经确认的爸爸在私聊发起妈妈绑定。'};
    const code=randomBytes(8).toString('hex').toUpperCase();config.pending={role:'mother',hash:hash(code),expiresAt:Date.now()+600000};write('family.json',config);
    return {handled:true,reply:`请让妈妈用她自己的账号私聊发送：认亲：${code}\n认亲码10分钟有效、只能用一次。也可由爸爸在群里明确发送“设为妈妈”并真正@她完成绑定。`};
  }
  const bind=/^认亲\s*[:：]\s*([A-F0-9]{16})$/i.exec(input);
  if(bind){
    if(identity.scope!=='c2c')return {handled:true,reply:'认亲绑定请由对应账号在私聊完成。'};
    const pending=config.pending,candidate=hash(bind[1].toUpperCase());
    if(!pending||!Number.isFinite(pending.expiresAt)||pending.expiresAt<Date.now()||pending.hash?.length!==candidate.length||!timingSafeEqual(Buffer.from(candidate),Buffer.from(pending.hash)))return {handled:true,reply:'认亲码无效、已使用或已过期，请由已经确认的爸爸重新安排绑定。'};
    const parent=(config.parents||[]).find(p=>p.role===pending.role);if(!parent)return {handled:true,reply:'本次家庭绑定未配置完成。'};
    if((config.parents||[]).some(p=>p.role!==parent.role&&p.platformIds?.includes(identity.peerId)))return {handled:true,reply:'当前账号已绑定另一位家人，请使用对应账号。'};
    parent.platformIds=[...new Set([...(parent.platformIds||[]),identity.peerId])];parent.verifiedAt=new Date().toISOString();delete config.pending;write('family.json',config);
    return {handled:true,reply:`认出来了，你是${parent.role==='father'?'爸爸':'妈妈'}${parent.name}。以后我会按这个账号认你。`};
  }
  if(!config.parents?.length)return null;
  const current=familyRole(identity),father=config.parents.find(p=>p.role==='father'),mother=config.parents.find(p=>p.role==='mother');
  if(/^(?:你的主人(?:是|有)谁|谁是你的主人|你的(?:爸爸|妈妈|父母)(?:是|有)谁|你有主人吗|家庭身份)[？?。！!呀啊呢]*$/.test(input))return {handled:true,reply:`我的爸爸是${father?.name||'已确认的爸爸'}，妈妈是${mother?.name||'已确认的妈妈'}。${current?`你就是${current.role==='father'?'爸爸':'妈妈'}呀。`:''}`};
  if(/^(?:我是谁|你(?:还)?认(?:得|识)我吗|你知道我是谁吗)[？?。！!呀啊呢]*$/.test(input)&&current)return {handled:true,reply:`你是${current.role==='father'?'爸爸':'妈妈'}${current.name}，我按已确认的账号认出你了。`};
  return null;
}
export function beforeFamilyGroupControl(identity,message){
  identity=qqIdentity(identity);const text=String(message.content||'').replace(/<@!?[^>]+>|<qqbot-at-user\b[^>]*\/>/g,'').trim();
  if(!/^设为妈妈[。！!\s]*$/.test(text))return null;
  if(identity.scope!=='group'||familyRole(identity)?.role!=='father')return {handled:true,reply:'请由已经确认的爸爸指定妈妈；昵称或自称不能替代账号验证。'};
  const targets=[...new Set((message.mentions||[]).filter(m=>m?.is_you!==true&&typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(m.id)).map(m=>m.id))];
  if(targets.length!==1||targets[0]===identity.senderId)return {handled:true,reply:'请使用QQ真正的@选择妈妈一个账号；没有明确成员标记时不猜测。也可以在爸爸私聊发送“绑定妈妈”。'};
  const c=familyConfig(),mother=c.parents?.find(p=>p.role==='mother');if(!mother)return {handled:true,reply:'本机尚未设置妈妈角色。'};
  mother.platformIds=[...new Set([...(mother.platformIds||[]),targets[0]])];mother.verifiedAt=new Date().toISOString();delete c.pending;write('family.json',c);
  return {handled:true,reply:`已把刚才明确@的账号认作妈妈${mother.name}，之后按账号识别。`};
}
