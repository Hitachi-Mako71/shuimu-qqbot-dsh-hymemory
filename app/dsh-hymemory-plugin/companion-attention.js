// Interaction state is temporary context, never a judgment about the user.
const minute = 60000;
export function attention(state, now = Date.now()) {
  const inbound = state.lastInboundAt || 0;
  const pending = (state.deliveries || []).filter((d) => d.at > inbound && (!d.status || d.status === 'accepted'));
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
  if (/^(?:我?先忙(?:了|一会儿?|会儿)?|我去忙了|晚点回你|等我忙完|先别打扰我)(?:[，,\s]*(?:晚点聊|回头聊|晚点再聊))?[。！!，,\s]*$/.test(text)) state.attention.quietUntil = now + 2 * 60 * minute;
  if (/^(?:我(?:先|要|去)?睡了|睡觉去了|晚安)[。！!，,\s]*$/.test(text)) state.attention.quietUntil = now + 8 * 60 * minute;
}

export function attentionContext(state, now = Date.now()) {
  const status = attention(state, now);
  const recentReturn = now - (state.attention?.returnedAt || 0) < 5 * minute;
  return `\n【当前互动状态，不是用户长期性格事实】\n${JSON.stringify({ ...status, recentReturn })}\n沉默仅表示没有收到新消息，不表示已读、拒绝、生气或感情变化。可用温柔轻微的想念和短暂落寞表现角色心情，不能给用户制造责任、责备、查岗、指控、依赖或惩罚。${recentReturn ? '用户刚回来：自然开心地接住当前话题，可简短说一句“你回来啦”，不盘问、不翻未回复旧账，不把旧消息一口气补发。' : ''}`;
}

