import {createHash,randomUUID} from 'node:crypto';
import {read} from './companion-state.js';
import {recordMetric} from './metrics.js';
export function retentionDecision(value) {
  const text=String(value||'').trim();
  if(!text)return {reason:'empty',proposedRetain:false};
  if(/^(?:好[的呀啊]?|嗯+|谢谢[你呀]?|收到|晚安|早安|你好|嗨)[呀啊哦呢～~!！。,.，?？\s]*$/.test(text))return {reason:'ack',proposedRetain:false};
  if(/^\[表情\d+\]$/.test(text)||(/\p{Extended_Pictographic}/u.test(text)&&!/[\p{Letter}\p{Number}]/u.test(text)))return {reason:'emoji',proposedRetain:false};
  return {reason:'content',proposedRetain:true};
}
export function createRetentionWindowAllocator({now=()=>Date.now()/1000}={}) {
  const active=new Map();
  return (identity,text,eligible,privacyVersion,settings={})=>{
    const key=createHash('sha256').update(JSON.stringify([identity.appId,identity.scope,identity.peerId,identity.senderId])).digest('hex');
    if(!eligible){active.delete(key);return null;}
    if(settings.batchEnabled!==true||!text.trim()||Array.from(text).length>1500||/^(?:\/|记住|更正|纠正|忘记|删除|原文|确认删除)/.test(text.trim())){active.delete(key);return null;}
    const seconds=Number.isInteger(settings.windowSeconds)?Math.max(2,Math.min(30,settings.windowSeconds)):8;
    const maxItems=Number.isInteger(settings.maxItems)?Math.max(2,Math.min(8,settings.maxItems)):4;
    const at=now();let window=active.get(key);
    if(!window||at>=window.closesAt||window.count>=maxItems||window.privacyVersion!==privacyVersion||window.seconds!==seconds||window.maxItems!==maxItems){
      window={id:randomUUID(),closesAt:at+seconds,maxItems,seconds,privacyVersion,count:0};active.delete(key);active.set(key,window);
    }
    window.count++;
    while(active.size>512)active.delete(active.keys().next().value);
    return {id:window.id,closesAt:window.closesAt,maxItems:window.maxItems};
  };
}
const allocate=createRetentionWindowAllocator();
export function retentionMetadata(identity,text,eligible,privacyVersion) {
  if(eligible){const decision=retentionDecision(text);recordMetric('retention_gate',{count:1,status:'shadow',reason:decision.reason});}
  const window=allocate(identity,text,eligible,privacyVersion,read('memory-optimization.json',{}).retention||{});
  return {schema:1,...(window?{retainWindow:window}:{})};
}
