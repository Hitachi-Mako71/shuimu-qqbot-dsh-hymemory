import test from 'node:test';
import assert from 'node:assert/strict';
import { namespaceOf } from '../dsh-hymemory-plugin/index.js';

const identity = Symbol.for('qqbot.identity');
const agent = (sessionId, peerId, scope = 'c2c') => ({
  session: { id: sessionId },
  [identity]: { appId: 'test-bot', scope, peerId },
});

test('QQ memory identity survives /new and a Harness restart', () => {
  assert.equal(namespaceOf(agent('old-session', 'alice')), namespaceOf(agent('new-session', 'alice')));
});

test('different QQ users and group scopes cannot share memory', () => {
  assert.notEqual(namespaceOf(agent('same-session', 'alice')), namespaceOf(agent('same-session', 'bob')));
  assert.notEqual(namespaceOf(agent('same-session', 'alice')), namespaceOf(agent('same-session', 'alice', 'group')));
});

test('non-QQ agents have no QQ memory namespace', () => {
  assert.equal(namespaceOf({ session: { id: 'desktop-session' } }), '');
});
