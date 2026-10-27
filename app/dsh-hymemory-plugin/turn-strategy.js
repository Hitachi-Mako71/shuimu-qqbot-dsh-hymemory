import defaultSettings from './turn-defaults.json' with {type:'json'};
import {read,write as writeRoom} from './companion-state.js';
import {memoryNamespace} from './identity.js';
import {mergeQQEvidence} from './evidence.js';
import {createHash,randomUUID} from 'node:crypto';

export const turnDefaults=Object.freeze(defaultSettings);
export function turnSettings(namespace=''){
 const raw=read('turn-settings.json',{}),s={...turnDefaults,...raw.defaults,...raw.conversations?.[namespace]};
 for(const k of ['privateQuietMs','privateMaxWaitMs','directQuietMs','directMaxWaitMs','candidateTtlMs','quietGapMs','followupTtlMs','maxUnanswered','implicitMaxTurns','maxBatchMessages','maxBatchChars'])if(!Number.isInteger(s[k])||s[k]<0||s[k]>3600000)throw Error('TurnStrategyConfigInvalid');
 if(typeof s.enabled!=='boolean'||!Array.isArray(s.knownBotIds)||s.knownBotIds.some(v=>typeof v!=='string')||s.privateMaxWaitMs<s.privateQuietMs||s.directMaxWaitMs<s.directQuietMs||s.maxBatchMessages<1||s.maxBatchChars<1||s.candidateTtlMs<1000)throw Error('TurnStrategyConfigInvalid');return s;
}
const control=t=>/^\/(?:new|reset|clear|stop|model|preset|compact|status|bot-help|ping|version)(?:\s|$)|^(?:停止|取消|暂停主动消息|关闭主动消息|开启主动消息|恢复主动消息|安静两小时|夜间免打扰|群聊节奏|群友模式|开启群友模式|关闭群友模式|群友频率|群里安静十分钟|删除状态|原文编号|最近原文|删除原文|确认删除|忘记|重试删除)(?:[:：\s]|$)/.test(t.trim());
const coalescers=new Set();
export function createQQCoalescer({merge=mergeQQEvidence,settings=turnSettings,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,maxQueue=16}={}){
 const pending=new Map(),dispatchLocks=new Map(),queued=new Map(),epochs=new Map(),queueLimit=Math.max(1,(Number.isInteger(maxQueue)?maxQueue:16)+1);let stopped=false;
 function finish(key,cancel=false){const b=pending.get(key);if(!b)return;pending.delete(key);clearTimer(b.timer);const survivor=cancel?null:merge(b.items.map(x=>x.ctx));for(const x of b.items)x.resolve(survivor===x.ctx);}
 function cancelConversation(key){epochs.set(key,(epochs.get(key)||0)+1);for(const [k,b] of pending)if(b.conversation===key)finish(k,true);}
 const middleware=async(ctx,next)=>{
  if(stopped)return;const m=ctx.message,scope=m.kind,peer=scope==='group'?m.groupOpenid:m.senderId,conversation=scope+':'+peer;
  const s=settings(memoryNamespace({appId:String(ctx.bot?.appId||process.env.QQBOT_APPID||'qqbot'),scope,peerId:peer}));if(control(m.content||'')){if(/^\/(?:new|reset|clear|stop|model|preset)(?:\s|$)|^(?:停止|取消)(?:[:：\s]|$)/.test((m.content||'').trim()))cancelConversation(conversation);return next();}
  if(!s.enabled||!['c2c','group'].includes(scope))return next();
  // Never merge two group members or unrelated quote targets into one author.
  const key=conversation+':'+m.senderId+':'+(m.refMsgIdx||''),quiet=scope==='c2c'?s.privateQuietMs:s.directQuietMs,max=scope==='c2c'?s.privateMaxWaitMs:s.directMaxWaitMs;
  let b=pending.get(key);if(b&&(b.items.length>=s.maxBatchMessages||b.chars+(m.content||'').length>s.maxBatchChars)){finish(key);b=null;}
  if(!b){b={conversation,createdAt:now(),items:[],chars:0};pending.set(key,b);}
  const epoch=epochs.get(conversation)||0,admitted=new Promise(resolve=>b.items.push({ctx,resolve}));b.chars+=(m.content||'').length;clearTimer(b.timer);b.timer=setTimer(()=>finish(key),Math.max(0,Math.min(quiet,b.createdAt+max-now())));
  if(!await admitted)return;
  if((queued.get(conversation)||0)>=queueLimit){ctx.stop?.('coalesce:queue-full');return;}
  queued.set(conversation,(queued.get(conversation)||0)+1);
  const task=(dispatchLocks.get(conversation)||Promise.resolve()).catch(()=>{}).then(()=>{if(!stopped&&(epochs.get(conversation)||0)===epoch)return next();});dispatchLocks.set(conversation,task);
  try{return await task;}finally{const n=(queued.get(conversation)||1)-1;if(n)queued.set(conversation,n);else queued.delete(conversation);if(dispatchLocks.get(conversation)===task)dispatchLocks.delete(conversation);}
 };
 middleware.dispose=()=>{stopped=true;for(const key of [...pending.keys()])finish(key,true);coalescers.delete(middleware);};coalescers.add(middleware);return middleware;
}
export const coalesceQQMessages=options=>createQQCoalescer(options);
const live=new Map();
const strip=t=>String(t||'').replace(/<@!?[^>]+>|<qqbot-at-user\b[^>]*\/>/g,'').trim();
export const correction=t=>/^(?:不对|说错|更正|改成|补充|再补|我指的是|主要是|具体要求|换成|不是.{0,25}(?:是|而是)|等等|等一下|先别|不用了|算了|停止|取消)|刚才.{0,16}(?:别|不要|取消)/.test(strip(t));
export const normalized=t=>strip(t).normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu,'');
export function topicTokens(t){const words=normalized(t).match(/[a-z0-9_]{2,}|[\u3400-\u9fff]{2,}/g)||[];return [...new Set(words.flatMap(w=>/^[a-z0-9_]+$/.test(w)?[w]:Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2))).filter(w=>!['这个','那个','怎么','什么','我们','你们','一下','好的','的是','了吗'].includes(w)))].slice(0,32);}
export function overlap(a,b){const x=new Set(Array.isArray(a)?a:topicTokens(a)),y=new Set(Array.isArray(b)?b:topicTokens(b));return [...x].filter(t=>y.has(t)).length;}
export const openQuestion=t=>/大家|谁知道|有没有|[？?]|怎么|为啥|何时|哪[个里种]|如何/.test(t);
export function observeTurn(identity,message){
 const key=memoryNamespace(identity),now=Date.now(),items=(live.get(key)||[]).filter(x=>now-x.at<180000).slice(-63);
 if(items.some(x=>x.id===message.messageId))return;
 items.push({id:message.messageId,sender:message.senderId,text:strip(message.content).slice(0,1200),at:now});live.delete(key);live.set(key,items);if(live.size>128)live.delete(live.keys().next().value);
}
export function noteDirectReply(context,text,receiptId){
 if(context?.identity?.scope!=='group'||context.kind!=='agent'||!text)return;
 const registry=read('groups/registry.json',{rooms:{}}),space=memoryNamespace(context.identity);if(registry.rooms[space]){registry.rooms[space].lastReplyAt=Date.now();writeRoom('groups/registry.json',registry);}
 if(!context.groupDirected)return;
 const key=memoryNamespace(context.identity),name='groups/rooms/'+key+'.json',room=read(name,{messages:[],deliveries:[],lastJudgedAt:0,newMessages:0});
 room.directThread={receiptId,sender:context.identity.senderId,at:Date.now(),topic:topicTokens(text),depth:context.followupDepth||0};
 // These are bounded routing hints, stored only in the existing scoped room.
 writeRoom(name,room);
}
export function directDeliveryCheck(identity,sourceMessages=[]){
 const key=memoryNamespace(identity),ids=new Set(sourceMessages),rows=live.get(key)||[],original=rows.filter(x=>ids.has(x.id));if(!original.length)return ()=>{};
 const last=Math.max(...original.map(x=>x.at)),authors=new Set(original.map(x=>x.sender));
 return ()=>{if((live.get(key)||[]).some(x=>x.at>=last&&!ids.has(x.id)&&authors.has(x.sender)&&(correction(x.text)||/^\/(?:stop|new|reset|clear)(?:\s|$)/.test(x.text))))throw Object.assign(Error('本轮已被同一用户更正或取消'),{name:'QQReplyCancelled',code:'STALE_CONTEXT'});};
}
export function replyEligibility(message,{mentioned=false,called=false,otherMention=false,quoteSelf=message.quotedIsSelf,now=Date.now(),lastReplyAt=0,thread=null,intervening=false,namespace=""}={}){
 if(message.senderIsBot)return {action:'SKIP',reason:'KNOWN_BOT'};
 if(mentioned)return {action:'REPLY',kind:'DIRECT',reason:'DIRECT_MENTION',addressee:message.senderId};
 if(otherMention)return {action:'SKIP',reason:'OTHER_ADDRESSEE'};
 if(called)return {action:'REPLY',kind:'DIRECT',reason:'DIRECT_NAME',addressee:message.senderId};
 const t=strip(message.content);
 if(quoteSelf&&/\S/.test(t)&&! /^(?:谢谢|好的|收到|懂了|晚安|拜拜)[。！!～~\s]*$/.test(t)&&(openQuestion(t)||/^(?:查一下|继续|展开|再|能|可以|帮|解释)/.test(t)))return {action:'REPLY',kind:'FOLLOWUP',reason:'BOT_QUOTE_FOLLOWUP',addressee:message.senderId};
 if(thread&&!intervening&&now-thread.at<=turnSettings(namespace).followupTtlMs&&thread.sender===message.senderId&&(thread.depth||0)<turnSettings(namespace).implicitMaxTurns&&openQuestion(t)&&overlap(t,thread.topic)>0)return {action:'REPLY',kind:'FOLLOWUP',reason:'TOPIC_FOLLOWUP',addressee:message.senderId,depth:(thread.depth||0)+1};
 if((!t&&(message.attachments||[]).length)||/^\[表情\d+\]$|^\[收到(?:图片|文件|媒体).{0,80}\]$/.test(t))return {action:'SKIP',reason:'UNKNOWN_MEDIA'};
 return {action:'EVALUATE',kind:'PROACTIVE',reason:'OPEN_DISCUSSION'};
}
export function candidateFor(event,room,now=Date.now()){return {id:randomUUID(),namespace:event.identity?memoryNamespace(event.identity):'',target:event.messageId,sender:event.sender,text:event.text,topic:topicTokens(event.text),sourceMessageIds:[event.messageId],epoch:room.epoch||'',cancelEpoch:room.cancelEpoch||0,previousDirectReceipt:room.directThread?.receiptId||null,visibleMessageIds:room.messages.map(m=>m.id),revision:room.revision||0,createdAt:now,expiresAt:event.receivedAt+turnSettings(event.identity?memoryNamespace(event.identity):"").candidateTtlMs};}
export function candidateCheck(candidate,room,row,{now=Date.now(),body=''}={}){
 if(!row?.enabled||now<(row.snoozeUntil||0))return {allow:false,reason:'DISABLED'};
 if((room.epoch||'')!==candidate.epoch||(room.cancelEpoch||0)!==candidate.cancelEpoch)return {allow:false,reason:'STALE_CONTEXT'};
 if(now>candidate.expiresAt)return {allow:false,reason:'STALE_CONTEXT'};
 const newer=room.messages.filter(m=>m.kind==='human'&&!candidate.visibleMessageIds.includes(m.id)&&m.id!==candidate.target);
 if((row.activity?.settleSeconds||0)>0&&newer.some(m=>m.kind==='human'))return {allow:false,reason:'WAIT_FOR_GAP'};
 const norm=normalized(body);
 if(body&&newer.some(m=>{const n=normalized(m.text);return n.length>=4&&(n===norm||norm.includes(n)||n.includes(norm));}))return {allow:false,reason:'ALREADY_ANSWERED'};
 if(newer.some(m=>correction(m.text)&&(m.sender===candidate.sender||overlap(m.text,candidate.topic)>0||m.replyTo===candidate.target)))return {allow:false,reason:'STALE_CONTEXT'};
 if(body&&room.messages.filter(m=>m.kind==='bot').slice(-4).some(m=>normalized(m.text)===norm))return {allow:false,reason:'NO_NEW_VALUE'};
 if(room.directThread?.receiptId&&room.directThread.receiptId!==candidate.previousDirectReceipt&&overlap(room.directThread.topic,candidate.topic)>0)return {allow:false,reason:'ALREADY_ANSWERED'};
 const previous=room.lastAmbient;
 if(previous&&previous.id!==candidate.id&&now-previous.at<30*60000&&!previous.acknowledged&&previous.status!=='rejected'&&(previous.unansweredCount||1)>=turnSettings(candidate.namespace).maxUnanswered&&(!openQuestion(candidate.text)||overlap(previous.topic,candidate.topic)>0))return {allow:false,reason:'UNANSWERED_PROACTIVE'};
 const lastHuman=room.messages.filter(m=>m.kind==='human').at(-1);
 if(lastHuman&&lastHuman.id!==candidate.target&&now-lastHuman.at<turnSettings(candidate.namespace).quietGapMs)return {allow:false,reason:'WAIT_FOR_GAP'};
 return {allow:true,reason:'VALUE_CANDIDATE'};
}
export function reserveCandidate(candidate,load,save,body,now=Date.now()){
 const {room,row}=load(),previous=room.lastAmbient;
 if(previous?.id===candidate.id)return {allow:false,reason:'DUPLICATE_DECISION'};
 if(previous?.status==='reserved')return {allow:false,reason:'IN_FLIGHT'};
 const check=candidateCheck(candidate,room,row,{body,now});if(!check.allow)return check;
 room.lastAmbient={id:candidate.id,at:now,topic:candidate.topic,target:candidate.target,status:'reserved',acknowledged:false,unansweredCount:previous?.acknowledged?1:(previous?.unansweredCount||0)+1};save(room);return {allow:true,reason:'RESERVED'};
}
export function registerTurnStrategy(ctx){ctx.effect(()=>()=>{for(const c of [...coalescers])c.dispose();live.clear();},'qq-turn-strategy.lifecycle');}
