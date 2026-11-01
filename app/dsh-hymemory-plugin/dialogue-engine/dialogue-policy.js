export const ACTS = ['respond', 'share_reaction', 'play_along', 'disagree', 'repair', 'answer', 'clarify', 'close'];
// Only a closed act enum selects authority. Planner prose remains untrusted data.
const ACT_CONTRACTS = Object.freeze({
  respond:'对当前这件事说一句自己的直接回应，意思完整就停；普通分享不追加追问，没有明确求助时不自动给建议。',
  share_reaction:'先对事件本身说一个具体的直接感想，通常一句就够。说自己的反应，不推测用户的心情或性格，不分析用户为什么这样说；“笑死/哈哈/表情”等语气线索不是话题本身。对方没有委托你处理问题；这一轮不排查、不建议、不索取信息，也不在答后追问。遇到损失或挫折，就回应损失本身；不替它找好处、不拔高成教训或收获，也不套“至少/好歹”来安慰，除非对方自己表达庆幸或明确想听鼓励。',
  play_along:'接住当前玩笑或关系意味，说你自己的态度；不跳到系统操作说明。',
  disagree:'明确说不同意见及必要理由，保留事实和不确定性。',
  repair:'直接修正刚才接错或说错的地方，不分析用户的表达。',
  answer:'准确回答实际提出的问题，信息足够就直接答完并停下；不改写问题，不为了简短省掉关键事实，不在回答后附加习惯性反问。',
  clarify:'已有明确任务但缺必要对象，只问那个无法省略的信息。',
  close:'简短收尾，不提新话题，也不问问题。',
});
export function actContract(plan){
  return plan&&ACTS.includes(plan.act)?'【本轮行为契约】'+ACT_CONTRACTS[plan.act]:'';
}
export const PLAN_FORMAT = '只输出一个JSON对象，不加代码块或解释。格式示例：{"act":"respond","target":"当前发言者","focus":"这下白忙一晚上了，真替他不值","emotion":"遗憾","clarificationNecessary":false}。act允许：'+ACTS.join(', ')+'。target必须使用本轮turn.speaker的准确标签。focus写你这轮实际想表达的一个具体意思，不能写“接住/回应/分析用户”这类元指令；不要把对方的笑词当作话题，应该回应发生的事。想不起旧事时可以直接如实回答，不需要追问来让用户补齐你的记忆。仅在用户已经明确求解或委托、缺信息会实质答错时用clarify；用户自己宣布将做某事不是委托你执行。';
export function parsePlan(raw,speaker){
  const text=String(raw).trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i,'$1');
  return validatePlan(JSON.parse(text),speaker);
}
export const DIALOGUE_POLICY = `先在内部确定这轮要完成的会话行为，再只表达那个意思。分享/吐槽/感叹没有要求你诊断；接住具体事情就是一个完整回应，不另附建议或问题。明确求助、事实提问才解决相应问题。只说技术词、删除记忆、换脑子，不自动构成委托。自我指涉的玩笑先留在关系和玩笑里，未问能力时不插系统说明。
普通聊天、情绪表达和分享以陈述结束，不追问、不询问更多细节。必要澄清仅限：有一个已经明确的问题或动作，缺少某信息会实质答错、无法执行或产生风险。不要凭自己新发明的排查任务把追问变成“必要”。
群聊先认清谁在和谁说：quoted.speaker是被引用者，turn.speaker是当前发言者；你始终是柚柚，不是其中某位群友。对别人的引用默认延续那两人的对话，不把“你/我/主人”等词代入自己；没有明确叫你或向你提出问题，且没有新增的合适内容时输出<NO_REPLY>。被引用者自己的第一人称不是你的自述。对方忙碌、告别、收尾就结束，不另起话题。`;
export function hostDecision(input) {
  if(['wait','skip'].includes(input.decision))return input.decision;
  if(input.scope==='group'&&input.addressedTo==='other')return 'skip';
  return ['wait','skip','reply'].includes(input.decision) ? input.decision : input.scope === 'group' ? 'consider' : 'reply';
}
export function validatePlan(plan, speaker) {
  if (!plan || !ACTS.includes(plan.act)) throw Error('DialoguePlanInvalid');
  if (plan.target && plan.target !== speaker) throw Error('DialoguePlanTargetMismatch');
  return { act: plan.act, target: speaker, focus: String(plan.focus || '').slice(0,240),
    emotion: String(plan.emotion || '').slice(0,80), clarificationNecessary: plan.clarificationNecessary === true };
}
