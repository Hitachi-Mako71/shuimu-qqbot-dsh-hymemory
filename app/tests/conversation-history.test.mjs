import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EvidenceStore } from '../dsh-hymemory-plugin/evidence.js';
import { memoryNamespace } from '../dsh-hymemory-plugin/identity.js';
import { readGroupHistory } from '../dsh-hymemory-plugin/conversation-history.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-conversation-history-'));
process.env.QQBOT_EVIDENCE_DIR = path.join(root, 'evidence');
process.env.QQBOT_PRIVACY_DIR = path.join(root, 'privacy');
process.env.QQBOT_COMPANION_DIR = path.join(root, 'companion');
fs.mkdirSync(process.env.QQBOT_EVIDENCE_DIR, { recursive: true });
fs.mkdirSync(process.env.QQBOT_PRIVACY_DIR, { recursive: true });
fs.mkdirSync(path.join(process.env.QQBOT_COMPANION_DIR, 'groups'), { recursive: true });

const identity = { appId: 'synthetic-app', scope: 'group', peerId: 'group-a', senderId: 'owner-a' };
const otherGroup = { ...identity, peerId: 'group-b' };
const otherApp = { ...identity, appId: 'synthetic-app-b' };
const rooms = Object.fromEntries([identity, otherGroup, otherApp].map(value => [memoryNamespace(value), { enabled: true, controller: value.senderId }]));
fs.writeFileSync(path.join(process.env.QQBOT_COMPANION_DIR, 'groups', 'registry.json'), JSON.stringify({ rooms }));

const privacy = new DatabaseSync(path.join(process.env.QQBOT_PRIVACY_DIR, 'lifecycle.sqlite3'));
privacy.exec(`PRAGMA user_version=1;
  CREATE TABLE privacy_spaces(namespace TEXT PRIMARY KEY, version INTEGER);
  CREATE TABLE privacy_operations(namespace TEXT, status TEXT);
  CREATE TABLE privacy_sources(namespace TEXT, source_id TEXT);`);
const store = new EvidenceStore(path.join(process.env.QQBOT_EVIDENCE_DIR, 'qq-evidence.sqlite3'));
const sourceIds = [];
for (let i = 0; i < 150; i++) {
  sourceIds.push(store.inbound({ ...identity, senderId: i % 2 ? 'member-b' : 'member-a' }, {
    messageId: `synth-${i}`, content: `合成历史消息 ${i}`, timestamp: `2026-11-02T00:${String(i % 60).padStart(2, '0')}:00Z`,
  }).id);
}
const current = store.inbound(identity, { messageId: 'synth-current', content: '当前合成消息' });
const db = new DatabaseSync(path.join(process.env.QQBOT_EVIDENCE_DIR, 'qq-evidence.sqlite3'));
const firstSeq = db.prepare('SELECT seq FROM evidence_events WHERE id=?').get(sourceIds[0]).seq;
db.close();

test.after(() => {
  store.close(); privacy.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('reads bounded recent authorized history and returns traceable source ids without raw evidence', () => {
  const result = readGroupHistory(identity, { beforePlatformMessageId: 'synth-current', limit: 32, maxScanRows: 256, maxChars: 12000 });
  assert.equal(result.messages.length, 32);
  assert.equal(result.messages.at(-1).text, '合成历史消息 149');
  assert.equal(result.messages[0].text, '合成历史消息 118');
  assert.equal(result.sourceIds.length, 32);
  assert.deepEqual(new Set(result.sourceIds), new Set(result.messages.map(message => message.sourceId)));
  assert.equal(result.messages.some(message => message.text === '当前合成消息'), false);
  assert.equal(result.messages.some(message => 'raw_json' in message || 'actor_id' in message), false);
  assert.match(result.messages[0].speaker, /^成员-/);
  assert.equal(result.privacyVersion, 0);
  assert.equal(result.coverage.complete, false);
});

test('does not cross group or app namespaces and requires the current source actor', () => {
  for (const target of [otherGroup, otherApp]) {
    const result = readGroupHistory(target, { beforePlatformMessageId: 'synth-current' });
    assert.equal(result.messages.length, 0);
    assert.equal(result.coverage.complete, false);
  }
  const wrongActor = readGroupHistory({ ...identity, senderId: 'another-member' }, { beforePlatformMessageId: 'synth-current' });
  assert.equal(wrongActor.messages.length, 0);
});

test('privacy pending, deleted sources, and deletion barriers prevent history exposure', () => {
  const namespace = memoryNamespace(identity);
  privacy.prepare('INSERT INTO privacy_operations(namespace,status) VALUES(?,?)').run(namespace, 'pending');
  assert.equal(readGroupHistory(identity, { beforePlatformMessageId: 'synth-current' }).coverage.reason, 'privacy-pending');
  privacy.prepare('DELETE FROM privacy_operations WHERE namespace=?').run(namespace);

  privacy.prepare('INSERT INTO privacy_sources(namespace,source_id) VALUES(?,?)').run(namespace, sourceIds[149]);
  let result = readGroupHistory(identity, { beforePlatformMessageId: 'synth-current' });
  assert.equal(result.sourceIds.includes(sourceIds[149]), false);
  assert.equal(result.coverage.reason, 'deleted-source');
  privacy.prepare('DELETE FROM privacy_sources WHERE namespace=?').run(namespace);

  const evidence = new DatabaseSync(path.join(process.env.QQBOT_EVIDENCE_DIR, 'qq-evidence.sqlite3'));
  evidence.prepare('INSERT INTO evidence_barriers(namespace,through_seq) VALUES(?,?)').run(namespace, firstSeq + 99);
  evidence.close();
  result = readGroupHistory(identity, { beforePlatformMessageId: 'synth-current' });
  assert.equal(result.messages.some(message => message.sourceId === sourceIds[0]), false);
  assert.equal(result.coverage.reason, 'deletion-barrier');
});

test('discards the whole batch when the privacy version changes during the read', () => {
  const namespace = memoryNamespace(identity);
  const result = readGroupHistory(identity, {
    beforePlatformMessageId: 'synth-current',
    afterReadForTest: () => privacy.prepare('INSERT INTO privacy_spaces(namespace,version) VALUES(?,1) ON CONFLICT(namespace) DO UPDATE SET version=excluded.version').run(namespace),
  });
  assert.equal(result.messages.length, 0);
  assert.equal(result.sourceIds.length, 0);
  assert.equal(result.coverage.reason, 'privacy-changed');
  assert.equal(result.privacyVersion, 1);
});

test('rejects invalid SQL boundary values and never creates a missing evidence database', () => {
  const invalid = readGroupHistory(identity, { beforePlatformMessageId: "synth-current' OR 1=1 --" });
  assert.equal(invalid.messages.length, 0);
  const tooLong = readGroupHistory(identity, { beforePlatformMessageId: 'x'.repeat(257) });
  assert.equal(tooLong.coverage.reason, 'current-source-invalid');

  const original = process.env.QQBOT_EVIDENCE_DIR;
  const missing = path.join(root, 'not-created');
  process.env.QQBOT_EVIDENCE_DIR = missing;
  const absent = readGroupHistory(identity, { beforePlatformMessageId: 'synth-current' });
  process.env.QQBOT_EVIDENCE_DIR = original;
  assert.equal(absent.coverage.reason, 'evidence-unavailable');
  assert.equal(fs.existsSync(path.join(missing, 'qq-evidence.sqlite3')), false);

  const evidenceFile = path.join(original, 'qq-evidence.sqlite3');
  const schema = new DatabaseSync(evidenceFile);
  schema.exec('PRAGMA user_version=99'); schema.close();
  const incompatible = readGroupHistory(identity, { beforePlatformMessageId: 'synth-current' });
  assert.equal(incompatible.coverage.reason, 'evidence-unavailable');
  const restore = new DatabaseSync(evidenceFile); restore.exec('PRAGMA user_version=4'); restore.close();
});