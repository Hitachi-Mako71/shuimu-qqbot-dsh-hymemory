import test from 'node:test';
import assert from 'node:assert/strict';
import * as plugin from '../dsh-hymemory-plugin/index.js';

process.env.MEMORY_BRIDGE_TOKEN = 'test-only-token';
const identity = { appId: 'bot-test', scope: 'c2c', peerId: 'alice' };

test('explicit remember is processed before Agent generation and reports source IDs', async () => {
  assert.equal(typeof plugin.beforeQQTurn, 'function', 'QQ inbound memory hook is missing');
  let sent;
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      sent = { path: new URL(url).pathname, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ ok: true, memories: [{ id: 'memory-123', content: '用户偏好简洁回答', layer: 'l2_fact', source: 'qqbot-dsh' }] }) };
    };
    const result = await plugin.beforeQQTurn({ identity, text: '记住：我偏好简洁回答', messageId: 'msg-1' });
    assert.equal(result.handled, true);
    assert.equal(sent.path, '/add');
    assert.match(sent.body.user_id, /^qq-[a-f0-9]{64}$/);
    assert.match(result.reply, /memory-123/);
  } finally { globalThis.fetch = original; }
});

test('memory outage permits normal QQ chat to continue', async () => {
  assert.equal(typeof plugin.beforeQQTurn, 'function', 'QQ inbound memory hook is missing');
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const result = await plugin.beforeQQTurn({ identity, text: '今天聊什么？', messageId: 'msg-2' });
    assert.equal(result.handled, false);
    assert.equal(result.available, false);
  } finally { globalThis.fetch = original; }
});

test('completed turn submission uses a stable delivery ID', async () => {
  assert.equal(typeof plugin.afterQQTurn, 'function', 'QQ completed-turn hook is missing');
  const sent = [];
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      sent.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true }) };
    };
    const input = { identity, text: '我偏好简洁回答', messageId: 'qq-message-1', sessionId: 'old-session' };
    await plugin.afterQQTurn(input);
    await plugin.afterQQTurn({ ...input, sessionId: 'new-session' });
    assert.equal(sent[0].job_id, sent[1].job_id);
    assert.equal(sent[0].messages[0].role, 'user');
  } finally { globalThis.fetch = original; }
});
