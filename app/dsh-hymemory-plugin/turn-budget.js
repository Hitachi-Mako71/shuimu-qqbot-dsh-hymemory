import {createHash} from 'node:crypto';
import {read} from './companion-state.js';
import {recordMetric} from './metrics.js';
import {qqInboundSignal} from './turn-context.js';
export const QQ_TURN_BUDGET=Symbol.for('qqbot.turn-budget');
const configured=new WeakSet(),executions=new WeakMap();
const defaults={enabled:true,maxModelRequests:12,maxToolCalls:24,maxMs:120000,maxRepeatedFailures:3};
const hash=value=>createHash('sha256').update(JSON.stringify(value).slice(0,8192)).digest('hex');
const signature=exec=>hash([exec.name,exec.arguments||{}]);
function limits(value={}){
  if(!value||typeof value!=='object')value={};
  const out={...defaults};
  for(const key of ['maxModelRequests','maxToolCalls','maxMs','maxRepeatedFailures'])if(Number.isInteger(value[key])&&value[key]>0&&value[key]<=600000)out[key]=value[key];
  out.enabled=value.enabled!==false;return out;
}
export function createTurnBudget(agent,settings={}, {now=()=>Date.now(),schedule=setTimeout,unschedule=clearTimeout,isCurrent=()=>true}={}) {
  const config=limits(settings),started=now();let modelRequests=0,toolCalls=0,aborted=false,reported=false,finished=false,lastFailure='',failures=0;const cleanup=[];
  function finish(status='ok'){
    unschedule(timer);finished=true;
    for(const dispose of cleanup.splice(0))dispose();
    if(!reported){reported=true;recordMetric('turn',{elapsedMs:Math.max(0,now()-started),modelRequests,toolCalls,status:aborted?'aborted':status});}
  }
  function abort(){
    if(aborted)return;aborted=true;finish('aborted');
    if(isCurrent())agent.cancel({kind:'user'});
  }
  function fail(){abort();throw Object.assign(Error('QQTurnLimit'),{name:'QQTurnLimit',code:'QQ_TURN_LIMIT'});}
  function assert(){if(aborted||now()-started>=config.maxMs)fail();}
  const timer=schedule(()=>{if(!finished)abort();},config.maxMs);timer?.unref?.();
  return {
    modelRequest(){assert();if(++modelRequests>config.maxModelRequests)fail();},
    beforeTool(){assert();if(++toolCalls>config.maxToolCalls)fail();},
    afterTool(exec,result){
      if(aborted)return;
      if(result?.isError!==true){lastFailure='';failures=0;return;}
      const key=signature(exec)+hash([result.error||null,(result.content||[]).filter(b=>b.type==='text').map(b=>String(b.text||'').slice(0,512))]);
      failures=key===lastFailure?failures+1:1;lastFailure=key;
      if(failures>=config.maxRepeatedFailures)abort();
    },
    assertDelivery:assert,finish,
    bindSignal(signal){
      if(!signal)return;
      if(signal.aborted){abort();signal.throwIfAborted();}
      signal.addEventListener('abort',abort,{once:true});
      cleanup.push(()=>signal.removeEventListener('abort',abort));
    },
  };
}
export function configureQQTurnBudget(agent,settings) {
  if(!configured.has(agent)){
    configured.add(agent);
    agent.ctx.on('agent/request',async(payload,next)=>{
      if(payload?.agent&&payload.agent!==agent)return next();
      agent[QQ_TURN_BUDGET]?.modelRequest();return next();
    });
    agent.ctx.on('tools/result',(exec,result)=>{
      if(exec.agent===agent)(executions.get(exec)||agent[QQ_TURN_BUDGET])?.afterTool(exec,result);
    });
    agent.ctx.on('session/event',(session,event)=>{
      if(session===agent.session&&event.type==='turn/end')agent[QQ_TURN_BUDGET]?.finish(event.data?.reason?.kind==='error'?'error':event.data?.reason?.kind==='aborted'?'aborted':'ok');
    });
  }
  agent[QQ_TURN_BUDGET]?.finish('closed');
  const config=limits(settings||read('memory-optimization.json',{}).turnBudget);
  if(!config.enabled){agent[QQ_TURN_BUDGET]=null;return null;}
  let budget;budget=createTurnBudget(agent,config,{isCurrent:()=>agent[QQ_TURN_BUDGET]===budget});
  agent[QQ_TURN_BUDGET]=budget;budget.bindSignal(qqInboundSignal());return budget;
}
export function qqTurnToolDenial(exec) {
  const budget=exec.agent?.[QQ_TURN_BUDGET];
  if(!budget)return undefined;
  executions.set(exec,budget);
  try{budget.beforeTool(exec);return undefined;}
  catch(error){if(error?.name==='QQTurnLimit')return '本轮已达到处理上限，剩余工具操作已停止。';throw error;}
}
