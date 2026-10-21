// Interaction state is temporary context, never a judgment about the user.
const minute = 60000;
export function attention(state, now = Date.now()) {
  const inbound = state.lastInboundAt || 0;
  const pending = (state.deliveries || []).filter((d) => d.at > inbound);
  const last = pending.at(-1);
  const checkIns = pending.filter((d) => d.kind === 'check-in').length;
  const quietUntil = state.attention?.quietUntil || 0;
  if (quietUntil > now) return { mode: 'busy', due: quietUntil, unanswered: pending.length };
  if (!last) return { mode: 'sharing', unanswered: 0 };
  // One ordinary share, then one light check-in; further silence tapers sharply.
  const interval = checkIns === 0 ? 45 * minute : checkIns === 1 ? 4 * 60 * minute : 24 * 60 * minute;
  const due = last.at + interval;
  return { mode: now < due ? 'waiting' : 'check-in', due, unanswered: pending.length,
    firstUnansweredAt: pending[0].at, lastPushAt: last.at,
    checkIns, tone: checkIns === 0 ? 'gentle-missing' : 'quiet-care' };
}

export function noteInbound(state, text, messageId, now = Date.now()) {
  if (messageId && state.attention?.lastInboundId === messageId) return;
  const before = attention(state, now);
  const returned = before.unanswered > 0 && now - before.firstUnansweredAt >= 45 * minute;
  state.lastInboundAt = now;
  state.attention = { ...(state.attention || {}), lastInboundId: messageId,
    quietUntil: 0, returnedAt: returned ? now : state.attention?.returnedAt || 0,
    previousUnanswered: returned ? before.unanswered : 0 };
  // Explicit everyday requests also suppress reminders; no inference from silence.
  if (/^(?:我先忙(?:一会儿|会儿)?|我去忙了|晚点回你|等我忙完|先别打扰我)[。！!，,\s]*$/.test(text)) state.attention.quietUntil = now + 2 * 60 * minute;
  if (/^(?:我(?:先|要|去)?睡了|睡觉去了|晚安)[。！!，,\s]*$/.test(text)) state.attention.quietUntil = now + 8 * 60 * minute;
}

export function attentionContext(state, now = Date.now()) {
  const status = attention(state, now);
  const recentReturn = now - (state.attention?.returnedAt || 0) < 5 * minute;
  return `\n【当前互动状态，不是用户长期性格事实】\n${JSON.stringify({ ...status, recentReturn })}\n沉默仅表示没有收到新消息，不表示已读、拒绝、生气或感情变化。可用温柔轻微的想念和短暂落寞表现角色心情，不能给用户制造责任、责备、查岗、指控、依赖或惩罚。${recentReturn ? '用户刚回来：自然开心地接住当前话题，可简短说一句“你回来啦”，不盘问、不翻未回复旧账，不把几条日记一口气补发。' : ''}`;
}

export async function makeCheckIn(state, model, status) {
  const result = JSON.parse((await model(
    '写水木的一条主动私聊。输出JSON {"message":"一句到两句，最多90字"}。这是角色表现，不声称AI有真实情绪。根据等待状态，第一回可轻轻说有一点想念/稍稍落寞，带一个容易接的话头；长时间没回只温柔留话，不继续催。可以礼貌问“忙完了么”但不能要求回复、问去向、猜用户处境、说已读不回、质问忽略、卖惨、内疚施压、占有或夸大依赖，不罗列新日常，不虚构既往对话。',
    JSON.stringify({ status, lastSharedMessage: state.lastSharedMessage || '', lastInboundAt: state.lastInboundAt || null }), 240)).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (typeof result.message !== 'string' || !result.message.trim() || result.message.length > 180) throw new Error('InvalidCheckIn');
  const review = JSON.parse((await model(
    '审核主动问候，仅输出JSON {"valid":true或false}。允许轻轻想念、短暂落寞、礼貌问忙完没。拒绝责备不回复、假称已读、查岗、虚构用户事实、以委屈伤心惩罚或感情责任索取回应、排他依赖，以及继续大段自说自话。内容含上述问题或不确定则false。',
    JSON.stringify({ message: result.message, waitingState: status }), 100)).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (review.valid !== true) throw new Error('CheckInNotConfirmed');
  return { message: result.message.trim(), shouldSend: true, kind: 'check-in' };
}
