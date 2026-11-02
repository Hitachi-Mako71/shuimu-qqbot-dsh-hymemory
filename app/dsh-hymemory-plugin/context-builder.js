import { actorLabel, qqIdentity } from './identity.js';
import { overlap, topicTokens } from './turn-strategy.js';
import { personaMaterialAllowed } from './persona-policy.js';
import { readGroupHistory } from './conversation-history.js';

const clamp = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;
const normalize = text => String(text || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();

function speakerLabels(records, current) {
  const labels = new Map();
  let member = 0, otherBot = 0;
  const speakerFor = item => {
    const role = item.role === 'assistant' || item.kind === 'bot' ? 'assistant'
      : item.role === 'other_bot' || item.kind === 'other_bot' ? 'other_bot' : 'member';
    const key = role === 'assistant' ? 'assistant' : `${role}:${item.speakerKey || item.sender || item.sourceId || 'unknown'}`;
    if (!labels.has(key)) labels.set(key, role === 'assistant' ? '柚柚'
      : role === 'other_bot' ? `群内AI${++otherBot}` : `群友${++member}`);
    return { label: labels.get(key), role };
  };
  const conversation = records.map(item => ({ ...speakerFor(item), text: item.text }));
  const selected = { ...speakerFor(current), text: current.text };
  return { conversation, selected, speakerFor };
}

export function resolveQuote({
  eventMessageId, refMsgIdx, verifiedQuoteRefMsgIdx, quotedText, quotedSenderId,
  quotedIsSelf = false, quotedSenderIsBot = false, remaining = 600,
} = {}) {
  if (typeof refMsgIdx !== 'string' || !refMsgIdx || typeof verifiedQuoteRefMsgIdx !== 'string'
    || verifiedQuoteRefMsgIdx !== refMsgIdx || typeof eventMessageId !== 'string' || !eventMessageId) {
    return { status: refMsgIdx ? 'unresolved' : 'none', message: null, targetKind: 'unknown' };
  }
  if (typeof quotedText !== 'string' || !quotedSenderId || remaining <= 0) {
    return { status: 'partial', message: null, targetKind: 'unknown' };
  }
  return {
    status: 'verified',
    message: { quotedText: quotedText.slice(0, Math.min(600, remaining)), quotedSenderId, quotedIsSelf, quotedSenderIsBot },
    targetKind: quotedIsSelf ? 'self' : 'other',
  };
}
function chronologicalRoom(room, event) {
  const messages = Array.isArray(room?.messages) ? room.messages : [];
  const currentIndex = messages.findIndex(item => item.id === event.messageId);
  const visible = currentIndex >= 0 ? messages.slice(0, currentIndex + 1) : messages.filter(item => item.at <= event.receivedAt);
  return visible.filter(item => item?.text && personaMaterialAllowed(item.text)).slice(-32);
}

export async function buildGroupReplyContext({
  identity: value, event, room, historyReader = readGroupHistory, maxCharacters = 12000,
} = {}) {
  const identity = qqIdentity(value);
  if (identity.scope !== 'group') throw Error('GroupContextRequiresGroupIdentity');
  const charLimit = clamp(maxCharacters, 12000, 256, 12000);
  const current = { ...event, text: String(event?.text || '').slice(0, 600), role: 'member', kind: 'human' };
  const recent = chronologicalRoom(room, event);
  const labels = speakerLabels(recent, current);
  const recentGroupConversation = [];
  const seenText = new Set();
  let remaining = charLimit - current.text.length;
  for (const item of recent.slice().reverse()) {
    if (item.id === event.messageId) continue;
    const text = String(item.text).slice(0, 400);
    const key = normalize(text);
    if (!key || seenText.has(key) || remaining <= 0) continue;
    const bounded = Array.from(text).slice(0, remaining).join('');
    if (!bounded) break;
    const speaker = labels.speakerFor({
      role: item.role === 'other_bot' || item.kind === 'other_bot' ? 'other_bot' : item.kind === 'bot' ? 'assistant' : 'member',
      speakerKey: item.sender || item.actorId || item.id,
    });
    recentGroupConversation.unshift({ ...speaker, text: bounded });
    seenText.add(key);
    remaining -= bounded.length;
    if (recentGroupConversation.length >= 24) break;
  }

  const quoteResult = resolveQuote({
    eventMessageId: event?.messageId, refMsgIdx: event?.refMsgIdx,
    verifiedQuoteRefMsgIdx: event?.verifiedQuoteRefMsgIdx,
    quotedText: event?.quotedText, quotedSenderId: event?.quotedSenderId,
    quotedIsSelf: event?.quotedIsSelf === true, quotedSenderIsBot: event?.quotedSenderIsBot === true,
    remaining,
  });
  let quotedMessage = null;
  let replyTargetKind = 'unknown';
  if (quoteResult.status === 'verified') {
    const quoteIdentity = { ...identity, senderId: quoteResult.message.quotedSenderId };
    const quote = labels.speakerFor({
      role: quoteResult.message.quotedIsSelf ? 'assistant' : quoteResult.message.quotedSenderIsBot ? 'other_bot' : 'member',
      speakerKey: quoteResult.message.quotedIsSelf ? 'assistant' : actorLabel(quoteIdentity),
    });
    quotedMessage = { ...quote, text: quoteResult.message.quotedText, sourceId: null, status: 'verified' };
    replyTargetKind = quoteResult.targetKind;
    remaining -= quoteResult.message.quotedText.length;
  } else if (event?.refMsgIdx || event?.quotedText || event?.quotedSenderId) {
    quotedMessage = { label: '引用对象未核实', role: 'unknown', text: '', sourceId: null, status: quoteResult.status, unresolved: true };
  }

  const history = await historyReader(identity, {
    beforePlatformMessageId: event.messageId, limit: 32, maxScanRows: 256, maxChars: Math.min(12000, charLimit),
  });
  if (['privacy-pending', 'privacy-changed', 'privacy-unavailable', 'group-not-authorized', 'identity-rejected'].includes(history?.coverage?.reason)) {
    return { data: null, sourceIds: [], roomMessageIds: [], privacyVersion: history.privacyVersion ?? null, blocked: true, reason: history.coverage.reason };
  }
  const roomKeys = new Set(recent.map(item => normalize(item.text)).filter(Boolean));
  const currentTokens = topicTokens(current.text);
  const historyCandidates = (history?.messages || []).filter(message => {
    const key = normalize(message.text);
    return key && !roomKeys.has(key) && overlap(currentTokens, topicTokens(message.text)) > 0;
  });
  const relatedHistory = [];
  const sourceIds = [];
  for (const message of historyCandidates.slice(-12)) {
    if (remaining <= 0) break;
    const text = Array.from(String(message.text || '')).slice(0, remaining).join('');
    if (!text) break;
    const label = message.role === 'assistant' ? { label: '柚柚', role: 'assistant' }
      : labels.speakerFor({ role: 'member', speakerKey: message.speaker });
    relatedHistory.push({ ...label, time: message.time || null, text, sourceId: message.sourceId });
    if (typeof message.sourceId === 'string') sourceIds.push(message.sourceId);
    remaining -= text.length;
  }
  const coverage = { ...(history?.coverage || { complete: false, reason: 'history-unavailable' }) };
  coverage.gaps = Array.isArray(coverage.gaps) ? [...coverage.gaps] : [];
  if (coverage.complete !== true && !coverage.gaps.includes('history-incomplete')) coverage.gaps.push('history-incomplete');
  if (event?.refMsgIdx && quoteResult.status !== 'verified' && !coverage.gaps.includes('quote-unresolved')) coverage.gaps.push('quote-unresolved');
  return {
    data: {
      selectedMessage: { ...labels.selected, messageId: event.messageId },
      recentGroupConversation,
      relatedHistory,
      quotedMessage,
      replyTargetKind,
      coverage,
    },
    sourceIds: [...new Set(sourceIds)],
    roomMessageIds: recent.map(item => item.id).filter(id => typeof id === 'string'),
    privacyVersion: history?.privacyVersion ?? null,
  };
}
export async function resolveGroupReplyContext({ mode, legacyData, ...input } = {}) {
  if (mode !== 'structured') return { data: legacyData, sourceIds: [], roomMessageIds: [], mode: 'legacy' };
  try {
    const result = await buildGroupReplyContext(input);
    if (result.blocked) return { ...result, mode: 'blocked' };
    return { ...result, mode: 'structured' };
  } catch { return { data: legacyData, sourceIds: [], roomMessageIds: [], mode: 'legacy-fallback' }; }
}