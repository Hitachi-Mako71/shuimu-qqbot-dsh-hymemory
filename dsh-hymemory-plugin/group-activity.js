import schema from './group-activity-config.json' with {type:'json'};
import {read,write} from './companion-state.js';
import {memoryNamespace} from './identity.js';

export const activityDefaults=Object.freeze(Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,v.default])));
export function activitySettings(value={}) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!Object.hasOwn(schema,k)))throw Error('群聊节奏包含未知字段。');
  const result={...activityDefaults,...value};
  for(const [key,spec] of Object.entries(schema)) {
    const v=result[key];
    if(spec.type==='boolean' ? typeof v!=='boolean' : !Number.isInteger(v)||v<spec.min||v>spec.max)throw Error(`${spec.label||key}格式无效${spec.type==='integer'?`，须为${spec.min}至${spec.max}的整数`:''}。`);
  }
  return result;
}
export function updateActivity(current,input) {
  const s=activitySettings(current),text=input.trim();
  if(text==='开启')return {...s,enabled:true};
  if(text==='关闭')return {...s,enabled:false};
  if(text==='重置')return {...activityDefaults};
  if(!text) return s;
  const labels=Object.fromEntries(Object.entries(schema).filter(([,v])=>v.label).map(([k,v])=>[v.label,k]));
  const pattern=/(判断间隔|每分钟|每小时|间隔|累计|限制点名|静默等待|自适应间隔|图片问答免@)\s*=?\s*(\d+|是|否)(?:条|秒)?/y;
  const seen=new Set();let cursor=0;
  while(cursor<text.length){while(/\s/.test(text[cursor]||'')&&cursor<text.length)cursor++;if(cursor===text.length)break;pattern.lastIndex=cursor;const m=pattern.exec(text);if(!m)throw Error('格式：群聊节奏 每分钟6条 间隔10秒 每小时120条 静默等待5秒 自适应间隔15秒；还可填“判断间隔5秒 累计1条 限制点名否”。');const key=labels[m[1]];if(seen.has(key))throw Error('同一参数不能重复。');seen.add(key);s[key]=schema[key].type==='boolean'?m[2]==='是'?true:m[2]==='否'?false:null:Number(m[2]);cursor=pattern.lastIndex;}
  return activitySettings({...s,enabled:true});
}
export function describeActivity(value,frequency='正常') {
  const s=activitySettings(value);
  const adaptiveGap=s.adaptiveGapSeconds?`${s.adaptiveGapSeconds}秒`:'沿用档位间隔';
  return `群聊节奏：${s.enabled?'自定义开启':'沿用档位'}，模式${frequency}。\n自定义：每分钟最多${s.perMinute}条，每小时最多${s.perHour}条，回复间隔至少${s.minIntervalSeconds}秒；${s.includeDirected?'@和点名也受限':'@和点名不受自定义限额限制'}。\n正常/安静档：累计${s.minMessages}条再考虑接话，判断间隔${s.judgeIntervalSeconds}秒；静默等待${s.settleSeconds}秒后评估新消息；自适应最短回复间隔${adaptiveGap}；附图提问${s.implicitImageQuestions?'可免@进入识图':'需@才进入识图'}。活跃档默认直接对话；本群若开启自适应策略则择机接话。\n用“群聊节奏 每分钟6条 间隔10秒 每小时120条 静默等待5秒 自适应间隔15秒 图片问答免@是”修改；开启、关闭、重置也可。限额内排队，等候超过2分钟的旧回复会取消。`;
}
export function nextGroupSendAt(attempts,s,now) {
  const recent=attempts.filter(at=>Number.isFinite(at)&&at>now-3600000).sort((a,b)=>a-b);
  let due=recent.length?recent.at(-1)+s.minIntervalSeconds*1000:now;
  const minute=recent.filter(at=>at>now-60000);
  if(minute.length>=s.perMinute)due=Math.max(due,minute[minute.length-s.perMinute]+60000);
  if(recent.length>=s.perHour)due=Math.max(due,recent[recent.length-s.perHour]+3600000);
  return Math.max(now,due);
}
const inbound=new Map();
export function rememberGroupReply(identity,messageId,{directed=false,control=false}={}) {
  const key=memoryNamespace(identity);if(identity.scope!=='group'||!key||!messageId)return;
  const id=key+'|'+messageId;inbound.delete(id);inbound.set(id,{identity,groupDirected:directed,control,at:Date.now()});
  if(inbound.size>256)inbound.delete(inbound.keys().next().value);
}
export function groupReplyContext(context,appId,target) {
  if(target?.scope!=='group')return null;
  const key=memoryNamespace({appId:String(appId),scope:'group',peerId:target.targetId});
  const saved=inbound.get(key+'|'+target.msgId),fresh=saved&&Date.now()-saved.at<300000?saved:null;
  return context?.identity?.scope==='group'?{...context,groupDirected:context.groupDirected??fresh?.groupDirected??false,control:context.control||fresh?.control||false}:fresh||{identity:{appId:String(appId),scope:'group',peerId:target.targetId},groupDirected:false,control:false};
}
const rateError=(code,message)=>Object.assign(Error(message),{name:'GroupReplyLimitError',code});
export function createGroupSendLimiter({now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),load=()=>read('groups/registry.json',{rooms:{}}),save=value=>write('groups/registry.json',value),maxWait=120000}={}) {
  const locks=new Map();
  return async function limit(context,send,check=()=>{}) {
    if(!context || context.identity?.scope!=='group' || context.control)return send();
    const key=memoryNamespace(context.identity),enqueuedAt=now();
    check();const initial=load().rooms?.[key],policy=activitySettings(initial?.activity||{});
    if(initial&&!context.groupDirected&&(!initial.enabled||!initial.controller||now()<(initial.snoozeUntil||0)))throw rateError('GROUP_REPLY_CANCELLED','本群已关闭或暂停，取消回复。');
    if(!initial||!policy.enabled||(context.groupDirected&&!policy.includeDirected))return send();
    const run=async()=>{
      while(true){
        check();const state=load(),row=state.rooms?.[key];
        if(!row)return send(); // Unbound direct replies retain the existing behavior.
        if(!context.groupDirected&&(!row.enabled||!row.controller||now()<(row.snoozeUntil||0)))throw rateError('GROUP_REPLY_CANCELLED','本群已关闭或暂停，取消排队回复。');
        const s=activitySettings(row.activity||{});
        if(!s.enabled || (context.groupDirected&&!s.includeDirected))return send();
        if(now()-enqueuedAt>maxWait)throw rateError('GROUP_REPLY_EXPIRED','回复排队超过2分钟，取消旧回复。');
        const due=nextGroupSendAt(row.replyAttempts||[],s,now());
        if(due<=now()){
          check();row.replyAttempts=[...(row.replyAttempts||[]).filter(at=>Number.isFinite(at)&&at>now()-3600000),now()].slice(-3600);save(state);
          return send(); // Reserve before API I/O, including ambiguous/failed attempts.
        }
        if(due-enqueuedAt>maxWait)throw rateError('GROUP_REPLY_EXPIRED','限额等待超过2分钟，取消旧回复。');
        await sleep(Math.min(1000,Math.max(1,due-now())));
      }
    };
    const task=(locks.get(key)||Promise.resolve()).catch(()=>{}).then(run);locks.set(key,task);
    try{return await task;}finally{if(locks.get(key)===task)locks.delete(key);}
  };
}
export const limitGroupSend=createGroupSendLimiter();
