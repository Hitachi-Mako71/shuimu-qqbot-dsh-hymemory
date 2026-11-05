// Attach to QQ agents only; apply after inherited request resolution, including
// resumed sessions whose stored effort may differ from profile defaults.
import { modelRoute } from './model-route.js';
import {memoryNamespace} from './identity.js';
const configured = new WeakSet();
const latest=new Map(),IDENTITY=Symbol.for('qqbot.identity'),EVIDENCE=Symbol.for('qqbot.evidence');
const efforts=new Set(['off','low','high','max']);
const baseline=()=>efforts.has(process.env.QQBOT_REASONING_EFFORT)?process.env.QQBOT_REASONING_EFFORT:'off';
export function carefulReviewRequested(value){
  const text=String(value||'').replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`|“[^”]*”|「[^」]*」|"[^"\n]*"/gu,' ');
  if(/(?:不用|不要|不必|无需|别|取消|停止)[^，,。；;\n]{0,12}(?:仔细|认真|深入|深度|再看|思考|分析)/u.test(text))return false;
  return /(?:仔细|认真|深入|深度|全面|详细|重新)[^。！？!?\n]{0,12}(?:看|检查|审查|分析|核对|阅读)|(?:再|重新)(?:看(?:一遍|看)?|检查|审查|分析)|(?:开启|用|请用)(?:高档|高强度|深度)思考/u.test(text);
}
export function reasoningForInput(input){return process.env.QQBOT_REASONING_MODE==='fixed'?baseline():carefulReviewRequested(input)?'high':baseline();}
export function reasoningStatus(identity){return {mode:process.env.QQBOT_REASONING_MODE==='fixed'?'fixed':'auto',baseline:baseline(),carefulEffort:'high',lastRequested:latest.get(memoryNamespace(identity))||null};}
export function configureQQResponseSpeed(agent) {
  if (configured.has(agent)) return;
  agent.ctx.on('agent/request', async (_payload, next) => {
    if(_payload?.agent&&_payload.agent!==agent)return next();
    const context=agent[EVIDENCE],input=context?.replyInput||'';
    const resolved = await next();
    const reasoningEffort=reasoningForInput(input),key=memoryNamespace(agent[IDENTITY]);
    if(key&&agent[EVIDENCE]===context){latest.set(key,{effort:reasoningEffort,at:new Date().toISOString()});if(latest.size>128)latest.delete(latest.keys().next().value);}
    return { ...resolved, ...modelRoute(), reasoningEffort };
  }, { prepend: true });
  configured.add(agent);
}
export function installQQReviewPolicy(ctx){
  ctx.get('systemPrompt').section({name:'qqbot:careful-review',order:497,interpolate:false,required:true,text:({agent})=>agent?.[IDENTITY]&&carefulReviewRequested(agent[EVIDENCE]?.replyInput)?
    '【本轮仔细复查】用户明确要求再看、仔细或深入检查。沿用当前对话里已提供的任务对象，不把“再看看”解释成上传了另一版文件，也不无依据比较版本。若涉及已提供的附件，先用当前会话文件工具重读相关原文/源码，检查之前遗漏的部分，再给出具体新增发现；不能只重复上次摘要或让用户替你指出尚未检查的地方。HTML 检查要包括 style、script、资源引用和交互逻辑，不只看可见正文；没有实际渲染时明确是源码检查，不能声称看过页面实际效果，也不猜“改动藏在样式或脚本”。PDF 用专用工具定位实际章节。对象确实无法确定时才简短澄清。结论必须有本轮实际来源，普通回复继续单段、说完即停，不追加无关系统诊断。':''});
}
