import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupReplyContext, resolveGroupReplyContext } from '../dsh-hymemory-plugin/context-builder.js';

const identity = { appId: 'synthetic-app', scope: 'group', peerId: 'group-a', senderId: 'member-a' };
const event = {
  identity, messageId: 'current-3', refMsgIdx: 'group-a:old-1', verifiedQuoteRefMsgIdx: 'group-a:old-1', receivedAt: 30, sender: 'member-a-hash', senderRole: 'member',
  text: 'Alpha 项目进展怎么样？', quotedSenderId: 'member-b', quotedText: 'Alpha 项目已经完成第一阶段', quotedIsSelf: false,
};
const room = { messages: [
  { id: 'old-1', at: 10, sender: 'member-b-hash', actorId: 'private-platform-id-b', kind: 'human', role: 'member', text: 'Alpha 项目上周开始。' },
  { id: 'old-2', at: 20, sender: '柚柚', kind: 'bot', role: 'assistant', text: '我记得 Alpha 项目刚启动。' },
  { id: 'current-3', at: 30, sender: 'member-a-hash', actorId: 'private-platform-id-a', kind: 'human', role: 'member', text: event.text },
  { id: 'future-4', at: 40, sender: 'member-b-hash', kind: 'human', role: 'member', text: '未来消息 Alpha' },
] };
const historyReader = async (_identity, options) => {
  assert.equal(options.beforePlatformMessageId, event.messageId);
  return {
    messages: [
      { sourceId: 'source-related', role: 'user', speaker: 'member-hash', time: '2026-11-01T00:00:00Z', text: 'Alpha 项目第二阶段本周启动。' },
      { sourceId: 'source-unrelated', role: 'user', speaker: 'member-hash', time: null, text: '晚餐要吃什么？' },
      { sourceId: 'source-duplicate', role: 'user', speaker: 'member-hash', time: null, text: 'Alpha 项目上周开始。' },
    ],
    sourceIds: ['source-related', 'source-unrelated', 'source-duplicate'],
    privacyVersion: 3,
    coverage: { complete: false, reason: 'bounded-recent-window' },
  };
};

test('structured context prioritizes current message, verified quote, recent turns, and relevant history', async () => {
  const result = await buildGroupReplyContext({ identity, event, room, historyReader });
  assert.equal(result.data.selectedMessage.text, event.text);
  assert.equal(result.data.selectedMessage.label, '群友2');
  assert.equal(result.data.recentGroupConversation.some(item => item.text.includes('未来消息')), false);
  assert.equal(result.data.quotedMessage.text, 'Alpha 项目已经完成第一阶段');
  assert.equal(result.data.replyTargetKind, 'other');
  assert.equal(result.data.quotedMessage.status, 'verified');
  assert.deepEqual(result.data.relatedHistory.map(item => item.sourceId), ['source-related']);
  assert.deepEqual(result.sourceIds, ['source-related']);
  assert.deepEqual(result.roomMessageIds, ['old-1', 'old-2', 'current-3']);
  assert.equal(JSON.stringify(result.data).includes('private-platform-id'), false);
  assert.equal(result.data.coverage.complete, false);
  assert.ok(result.data.coverage.gaps.includes('history-incomplete'));
});

test('unverified quote is marked unresolved and never invents an author', async () => {
  const result = await buildGroupReplyContext({
    identity, event: { ...event, verifiedQuoteRefMsgIdx: undefined, quotedSenderId: undefined }, room, historyReader,
  });
  assert.equal(result.data.quotedMessage.unresolved, true);
  assert.equal(result.data.quotedMessage.role, 'unknown');
  assert.equal(result.data.replyTargetKind, 'unknown');
  assert.ok(result.data.coverage.gaps.includes('quote-unresolved'));
});

test('quote proof must match the current platform reference exactly', async () => {
  const result = await buildGroupReplyContext({
    identity, event: { ...event, verifiedQuoteRefMsgIdx: 'other-group:old-1' }, room, historyReader,
  });
  assert.equal(result.data.quotedMessage.status, 'unresolved');
  assert.equal(result.data.quotedMessage.role, 'unknown');
  assert.equal(result.data.replyTargetKind, 'unknown');
});

test('legacy mode preserves its prior input; structured failure safely falls back', async () => {
  const legacyData = { recentGroupConversation: [{ role: 'member', label: '群友1', text: '旧输入' }] };
  const off = await resolveGroupReplyContext({ mode: 'off', legacyData, identity, event, room, historyReader });
  assert.equal(off.data, legacyData);
  assert.equal(off.mode, 'legacy');
  const failed = await resolveGroupReplyContext({
    mode: 'structured', legacyData, identity, event, room,
    historyReader: async () => { throw Error('synthetic unavailable'); },
  });
  assert.equal(failed.data, legacyData);
  assert.equal(failed.mode, 'legacy-fallback');
});
