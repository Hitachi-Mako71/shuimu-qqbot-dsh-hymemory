import {parsePlan} from './dialogue-policy.js';
const prose=text=>String(text).replace(/```[\s\S]*?```/g,'').replace(/^\s*>.*$/gm,'');
export function replyReviewReasons(text,input={}){
  const value=prose(text),reasons=[];
  if(/[?？]|哪(?:儿|里|种|个)|什么(?:错误|报错)|要不要|能不能|有没有/u.test(value))reasons.push('question_needs_context');
  if(/听起来|你这句话|今晚这句|笑得出来|笑.*说明|看来.*(?:开心|乐|不严重)|心态.*(?:佩服|不错)|[“「]?又[”」]?字/u.test(value))reasons.push('speaker_commentary');
  if(/(?:我|这里|这边)[^。！？\n]{0,10}(?:没有|不能|无法)[^。！？\n]{0,10}(?:记忆|记录|权限|操作|清除|删除)/u.test(value))reasons.push('unsupported_capability_risk');
  if(input.hasImages)reasons.push('image_response_fit');
  return reasons;
}
export async function reviewDialogueDraft(input,draft,{generate,data,signal}={}){
  const reasons=replyReviewReasons(draft,input);
  const acts=new Set((data?.examples||[]).map(e=>['image','emotion_transition'].includes(e.act)?'share_reaction':e.act));
  if(input.exampleIds!==undefined&&acts.size>1&&['answer','clarify'].some(a=>acts.has(a)))reasons.push('ambiguous_speech_act_examples');
  if(!reasons.length)return {text:draft,checked:false,accepted:true,reasons:[]};
  signal?.throwIfAborted();
  const raw=await generate({stage:'review',system:'你是柚柚，真诚、温柔、有主见的AI伙伴。只修正当前这一轮回复，不写分析或评分。先看真实原消息是在分享、玩笑、提问还是明确委托。\n分享/吐槽：只对事情说一句具体反应，不追问、不排错、不建议，不评论对方为什么笑。关系或身份玩笑：先接那句话，不讲未被问的权限。明确问题/任务：准确回答；只有关键对象没给才问一个必要问题。不能自创任务再要求信息。\n图文分享说自己的感想或希望，只有明确要求才分析。不给愿望补结局，不加事实、身体经历、记忆或已执行操作，保留原有事实和不确定性。原稿已经合适就保留。\n'+String(input.hostSystem||'')+'\n只输出JSON：{"act":"respond","target":"本轮发言者标签","clarificationNecessary":false,"text":"最终回复"}。仅必要澄清用act=clarify并设clarificationNecessary=true。不要用无问号的追问绕过限制。',
    user:JSON.stringify({recentTurns:data?.turn?.turns||[],quoted:data?.turn?.quoted||null,ground:data?.ground||[],suppliedContext:data?.suppliedContext||'',draft,reasons,currentMessage:{speaker:data?.turn?.speaker||input.speaker||'当前发言者',text:input.text||''}}),signal});
  const value=JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i,'$1'));
  const plan=parsePlan(JSON.stringify(value),data?.turn?.speaker||input.speaker||'当前发言者');
  if(typeof value.text!=='string'||!value.text.trim())throw Error('DialogueReviewEmpty');
  if(/[?？]/u.test(prose(value.text))&&!(plan.act==='clarify'&&plan.clarificationNecessary))throw Error('DialogueReviewQuestionUnjustified');
  return {text:value.text.trim(),checked:true,accepted:true,reasons,act:plan.act};
}
