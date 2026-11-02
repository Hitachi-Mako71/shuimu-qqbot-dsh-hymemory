import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { groupContextMode } from '../dsh-hymemory-plugin/conversation-policy.js';
import { resolveGroupReplyContext } from '../dsh-hymemory-plugin/context-builder.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-group-context-route-'));
const previous = process.env.QQBOT_COMPANION_DIR;
process.env.QQBOT_COMPANION_DIR = root;
fs.writeFileSync(path.join(root, 'conversation-policy.json'), JSON.stringify({ enabled: true }));

test.after(() => {
  if (previous === undefined) delete process.env.QQBOT_COMPANION_DIR;
  else process.env.QQBOT_COMPANION_DIR = previous;
  fs.rmSync(root, { recursive: true, force: true });
});

test('group context stays legacy unless the exact structured flag is present', () => {
  assert.equal(groupContextMode(), 'legacy');
  fs.writeFileSync(path.join(root, 'conversation-policy.json'), JSON.stringify({ enabled: true, groupContext: { mode: 'broken' } }));
  assert.equal(groupContextMode(), 'legacy');
  fs.writeFileSync(path.join(root, 'conversation-policy.json'), JSON.stringify({ enabled: true, groupContext: { mode: 'structured' } }));
  assert.equal(groupContextMode(), 'structured');
});

test('legacy mode preserves G0 input and structured mode returns source-tracked G1 input', async () => {
  const legacyData = { selectedMessage: { label: '群友1', text: 'same input' }, recentGroupConversation: [] };
  const base = { identity: { appId: 'app', scope: 'group', peerId: 'room', senderId: 'member' },
    event: { messageId: 'current', receivedAt: 2, sender: 'member-hash', text: 'Alpha 项目进展' },
    room: { messages: [{ id: 'current', at: 2, sender: 'member-hash', kind: 'human', text: 'Alpha 项目进展' }] },
    historyReader: async () => ({ messages: [{ sourceId: 'evidence-1', role: 'user', speaker: 'speaker-hash', text: 'Alpha 项目上周启动' }], privacyVersion: 1, coverage: { complete: false, reason: 'bounded-recent-window' } }) };
  const g0 = await resolveGroupReplyContext({ ...base, mode: 'legacy', legacyData });
  const g1 = await resolveGroupReplyContext({ ...base, mode: groupContextMode(), legacyData });
  assert.equal(g0.data, legacyData);
  assert.equal(g0.mode, 'legacy');
  assert.equal(g1.mode, 'structured');
  assert.equal(g1.data.selectedMessage.text, 'Alpha 项目进展');
  assert.deepEqual(g1.sourceIds, ['evidence-1']);
  const blocked = await resolveGroupReplyContext({ ...base, mode: 'structured', legacyData, historyReader: async () => ({ messages: [], coverage: { complete: false, reason: 'privacy-pending' } }) });
  assert.equal(blocked.mode, 'blocked');
  assert.equal(blocked.data, null);
});