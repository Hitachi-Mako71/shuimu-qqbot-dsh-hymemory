/** Bounded retries only; scheduling remains owned by the existing group queue. */
export function planWait(candidate, decision, {now, attempts=0, maxAttempts=2, delayMs=1000}={}) {
  const stop={action:'expire',delayMs:0};
  if(decision?.decision!=='WAIT'||!Number.isFinite(now)||!Number.isFinite(candidate?.expiresAt))return stop;
  if(!Number.isInteger(attempts)||attempts<0||!Number.isInteger(maxAttempts)||maxAttempts<1||attempts>=Math.min(2,maxAttempts))return stop;
  if(!Number.isFinite(delayMs)||delayMs<=0)return stop;
  const delay=Math.max(250,Math.min(60000,delayMs));
  if(now+delay>=candidate.expiresAt)return stop;
  return {action:'reschedule',delayMs:delay};
}

export function createParticipationWait({now=Date.now,onWait=()=>{},onCancel=()=>{}}={}) {
  const records=new Map();
  function cancel(key,messageId) {
    const record=records.get(key);
    if(!record||messageId===record.candidate.target)return false;
    record.cancelled=true;records.delete(key);onCancel(key,record.event);return true;
  }
  function track(key,event,candidate) {
    if(event.participationWait)return event.participationWait;
    cancel(key);
    const record={event,candidate,attempts:0,cancelled:false};
    event.participationWait=record;records.set(key,record);return record;
  }
  function current(key,record,{room,row,mode}={}) {
    if(!record||record.cancelled||records.get(key)!==record||!['mock','pilot'].includes(mode))return false;
    const at=now(),c=record.candidate;
    return Boolean(row?.enabled&&at>=(row.snoozeUntil||0)&&at<c.expiresAt&&at<record.event.receivedAt+120000
      &&(room?.epoch||'')===c.epoch&&(room?.cancelEpoch||0)===c.cancelEpoch&&(room?.revision||0)===c.revision);
  }
  function defer(key,record,decision,context,delayMs) {
    if(!current(key,record,context))return {action:'expire',delayMs:0};
    const c={...record.candidate,expiresAt:Math.min(record.candidate.expiresAt,record.event.receivedAt+120000)};
    const plan=planWait(c,decision,{now:now(),attempts:record.attempts,delayMs});
    if(plan.action==='reschedule'){record.attempts++;onWait(key,record.event,plan.delayMs);}
    return plan;
  }
  function complete(key,record){if(records.get(key)===record){record.cancelled=true;records.delete(key);}}
  function clear(){for(const key of [...records.keys()])cancel(key);}
  return {track,current,defer,cancel,complete,clear};
}
