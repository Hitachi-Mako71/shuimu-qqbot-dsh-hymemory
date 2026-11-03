import {recordMetric} from './metrics.js';
const IDENTITY=Symbol.for('qqbot.identity'),EVIDENCE=Symbol.for('qqbot.evidence');
const installed=new WeakSet();
const empty=()=>({search:{attempts:0,successes:0},fetch:{attempts:0,successes:0}});
const count=(context,kind,field)=>Number.isInteger(context?.webEvidence?.[kind]?.[field])?Math.max(0,context.webEvidence[kind][field]):0;
export const UNVERIFIED_WEB_REPLY='这条信息我还没有核实清楚，暂时不能给出可靠结论';

export function installQQToolEvidence(ctx) {
  if(installed.has(ctx))return;installed.add(ctx);
  ctx.on('tools/execute',async(exec,next)=>{
    const context=exec.agent?.[EVIDENCE],kind=exec.name==='web_search'?'search':exec.name==='web_fetch'?'fetch':['read','glob','grep','qqbot_clock','qqbot_timetable','qqbot_group_members'].includes(exec.name)?'local':null;
    if(!kind||!context||!exec.agent?.[IDENTITY])return next();
    // Capture this turn before awaiting: late completion cannot credit a new turn.
    context.webEvidence||=empty();context.webEvidence[kind]||={attempts:0,successes:0};
    context.webEvidence[kind].attempts++;
    const result=await next();
    if(result?.isError===false)context.webEvidence[kind].successes++;
    return result;
  });
  ctx.get('systemPrompt').section({name:'qqbot:tool-evidence',order:457,required:true,interpolate:false,text:({agent})=>agent?.[IDENTITY]?toolEvidencePrompt(agent[EVIDENCE]):''});
}
export function toolEvidencePrompt(context) {
  return `【本轮网页依据】当前搜索执行${count(context,'search','attempts')}次、成功${count(context,'search','successes')}次；网页读取执行${count(context,'fetch','attempts')}次、成功${count(context,'fetch','successes')}次。旧会话的搜索或读取不能算成本轮已执行。未执行不能说“我搜了/查到了/看了网页”；仅复用旧资料时明确说依据之前资料。不确定的术语先按当前领域实际搜索；仍无可靠来源就说明无法确认，不把相近方法猜成定义。`;
}
function asserted(text,pattern) {
  for(const match of text.matchAll(pattern)){
    const before=text.slice(Math.max(0,match.index-16),match.index);
    if(/(?:没有|还没|尚未|未|不|不能|不要|无法|如果|假如|例如|比如|除非)\s*$/u.test(before))continue;
    return true;
  }
  return false;
}
export function groundedQQReply(value,context) {
  if(typeof value!=='string'||!['agent','group'].includes(context?.kind))return value;
  const text=value.replace(/```[\s\S]*?```|`[^`\n]*`|“[^”]*”|「[^」]*」|『[^』]*』/gu,' ');
  const search=asserted(text,/(?:我|本轮|这次)(?:刚刚|刚才|刚|已经|已|又|也|还)?(?:在网上|联网)?(?:搜索|查询|检索|搜|查)(?:了|过)/gu);
  const negativeFinding=/(?:我|本轮|这次)(?:没有|没|未)(?:搜索到|检索到|搜到)/u.test(text);
  const found=asserted(text,/(?:搜|查|检索)到|(?:搜索|查询|检索)结果(?:显示|表明)/gu);
  const page=asserted(text,/(?:我|本轮|这次)(?:刚刚|刚才|刚|已经|已)?(?:打开|读取|看|读)(?:了|过)(?:这个|该|这篇|这张)?(?:网页|链接|页面)|(?:网页|页面)(?:原文)?(?:显示|写着|说明)/gu);
  const explicitWeb=/(?:在网上|联网|搜索引擎)/u.test(text);
  const localAttempts=explicitWeb?0:count(context,'local','attempts'),localSuccesses=explicitWeb?0:count(context,'local','successes');
  const reason=((search||negativeFinding)&&!count(context,'search','attempts')&&!localAttempts)||(found&&!count(context,'search','successes')&&!localSuccesses)?'unverified_search':page&&!count(context,'fetch','successes')?'unverified_fetch':'';
  if(!reason)return value;
  recordMetric('grounding',{count:1,status:'blocked',reason});
  return UNVERIFIED_WEB_REPLY;
}
