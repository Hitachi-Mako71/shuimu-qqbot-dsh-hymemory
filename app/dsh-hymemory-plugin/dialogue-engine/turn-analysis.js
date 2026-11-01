import { ACTS } from './dialogue-policy.js';

const REQUEST = /(?:(?:帮我|请你|麻烦你|替我|能不能(?:帮我|给我)?|可以(?:帮我|给我)?|请问|想问(?:一下)?).{0,48}(?:看|查|搜|找|写|做|改|修|测|排查|检查|解释|分析|总结|优化|部署|生成|画|发|清理|删除|说明|比较|对比|推荐|安排|排|列|设计|规划|润色|改写|描述|核对|命名|挑选|替换|陪我)|(?:^|[，。！？\s])(?:分析|解释|总结|描述|比较|对比|推荐|检查|看看|查查|帮忙看看)一下.{0,60}(?:这|那|朋友|句话|消息|段|图|报错|原因|为什么|意思|含义)|你陪我.{0,16}(?:说|聊|待))/u;
const INCOMPLETE_REQUEST = /^(?:(?:帮我|请你|麻烦你)\s*)?(?:把)?那个.{0,12}(?:改|删|修|优化|调整|安排|处理)(?:一下)?[。！？!?]*$/u;
const QUESTION = /(?:为什么|怎么(?:办|做|弄|配|修|写|用|回事|处理|改|确认|安排|实现|才能|样)|什么(?:是|意思|情况|时候|人|事|叫|原因)|哪(?:个|里|些|种|条)|多少|几点|是否|能否|可不可以|能不能|怎么看|如何|怎样|能(?:推荐|说明|解释)).{0,80}[?？。！!]*$|(?:吗|呢)[?？]?$/u;
const MARKED_WH_QUESTION = /(?:什么|谁|哪里|哪些|哪种|哪个).{0,80}[?？]$/u;
const AFFECTIVE_RHETORICAL_QUESTION = /(?:服了|离谱|烦死|气死|无语|崩溃|怎么又).{0,48}[?？]/u;
const SELF_PLAN = /(?:我(?:准备|打算|想|要|得去|准备去).{0,24}(?:检查|优化|写|查|搜|分析|修|部署|测试|生成)|我先去.{0,18}(?:充会儿电|休息一会儿|吃点东西|洗个澡).{0,12}(?:等下|一会儿|待会儿|回来))/u;
const CORRECTION = /^(?:(?:柚柚|你)[，,\s]*)?(?:不是|我说的是|我指的是|刚才说错了|又说错了|你看错了|不对[，,]|(?:我刚才|我刚|我前面).{0,32}(?:说错了|说的不对|写错了|不对)|你刚才.{0,24}(?:说错|记错|弄错))/u;
const CLOSING = /^(?:我先去忙|先忙了|我去睡了|我先睡了|先睡了|晚安|拜拜|回头聊|下次聊)/u;
const SHARE_MARKER = /笑死|哈哈|气死|烦死|服了|离谱|难受|寂寞|孤单|一个人|可惜|遗憾|崩溃|白等|白忙|总算|没买到|没了|忘了|才发现|居然|竟然/u;

// Conservative turn-level cue analysis. It does not infer emotion from a single
// token alone; explicit requests/questions take precedence over sharing cues.
export function analyzeDialogueTurn(input = {}) {
  const text=String(input.text||'').trim().slice(0,6000);
  let act='respond', basis='default_recipiency';
  if(input.addressedTo==='other'){act='respond';basis='addressed_to_other';}
  else if(CLOSING.test(text)){act='close';basis='closing_sequence';}
  else if(SELF_PLAN.test(text)&&!REQUEST.test(text)&&!QUESTION.test(text)&&!MARKED_WH_QUESTION.test(text)&&!/(?:我想让你|我想请你|我需要你)/u.test(text)){act='respond';basis='self_announced_intention';}
  // Affective rhetorical questions are frequent in Chinese chat; explicit requests still win.
  else if(INCOMPLETE_REQUEST.test(text)){act='clarify';basis='request_missing_object';}
  else if(REQUEST.test(text)){act='answer';basis='explicit_request';}
  else if(CORRECTION.test(text)&&!QUESTION.test(text)){act='repair';basis='explicit_correction';}
  else if(AFFECTIVE_RHETORICAL_QUESTION.test(text)){act='share_reaction';basis='affective_rhetorical_question';}
  // A question mark alone is not a request; a question word or interrogative particle is required.
  else if(QUESTION.test(text)||MARKED_WH_QUESTION.test(text)){act='answer';basis='explicit_question';}
  else if(input.hasImages===true||String(input.quotedText||'').trim()||SHARE_MARKER.test(text)||/(?:^|[，。！？\s])(?:我|今天|刚才|本来|结果|终于).{3,}/u.test(text)){
    act='share_reaction';basis=input.hasImages?'image_shared':String(input.quotedText||'').trim()?'quoted_content_shared':'personal_or_affective_narrative';
  }
  if(!ACTS.includes(act))throw Error('DialogueActAnalysisInvalid');
  return Object.freeze({act,basis});
}
