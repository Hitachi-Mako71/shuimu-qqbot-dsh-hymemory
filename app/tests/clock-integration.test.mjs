import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { beforeClockTurn, readClock, installClock } from '../dsh-hymemory-plugin/clock.js';
import { qqIdentity, memoryNamespace } from '../dsh-hymemory-plugin/identity.js';
import { qqWorkspace, qqToolDenial } from '../dsh-hymemory-plugin/workspace.js';
import { beforeQQTurn } from '../dsh-hymemory-plugin/bridge.js';
import { archiveQQInbound, closeQQEvidence } from '../dsh-hymemory-plugin/evidence.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-clock-acceptance-'));
Object.assign(process.env, {
  QQBOT_APPID: 'clock-test', QQBOT_CLOCK_ENABLED: 'true', QQBOT_EVIDENCE_ENABLED: 'true',
  QQBOT_COMPANION_DIR: path.join(temp, 'companion'), QQBOT_WORKSPACE_ROOT: path.join(temp, 'workspaces'),
  QQBOT_PRIVACY_DIR: path.join(temp, 'privacy'), QQBOT_EVIDENCE_DIR: path.join(temp, 'evidence'),
  QQBOT_MODEL_ROUTING_FILE: path.join(temp, 'routing.json'),
  MEMORY_BRIDGE_TOKEN: 'synthetic-clock-test-token', MEMORY_BRIDGE_URL: 'http://127.0.0.1:1',
});
fs.mkdirSync(process.env.QQBOT_PRIVACY_DIR);
const db = new DatabaseSync(path.join(process.env.QQBOT_PRIVACY_DIR, 'lifecycle.sqlite3'));
db.exec(`CREATE TABLE privacy_spaces(namespace TEXT PRIMARY KEY,version INTEGER);
CREATE TABLE privacy_operations(id TEXT PRIMARY KEY,namespace TEXT,status TEXT);
CREATE TABLE privacy_sources(namespace TEXT,source_id TEXT); PRAGMA user_version=1;`);
let nextId = 0;
const who = () => qqIdentity({ appId: 'clock-test', scope: 'c2c', peerId: 'person-' + (++nextId) });
const settingsFile = i => path.join(process.env.QQBOT_COMPANION_DIR, 'people', memoryNamespace(i) + '.json');
const command = (identity, text) => beforeClockTurn({ identity, text });
const saveRegistry = value => {
  const dir = path.join(process.env.QQBOT_COMPANION_DIR, 'groups'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(value));
};
test.after(() => {
  closeQQEvidence(); db.close();
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('qq-clock-acceptance-'));
  fs.rmSync(temp, { recursive: true, force: true });
});

test('unconfirmed timezone does not create settings or infer a location', async () => {
  const identity = who(); const r = readClock(identity);
  assert.equal(r.status, 'timezone_required'); assert.equal(fs.existsSync(settingsFile(identity)), false);
  assert.match((await command(identity, '现在几点')).reply, /尚|确认/);
});
test('private raw command confirms a setting, while one-off UTC keeps it intact', async () => {
  const identity = who();
  assert.match((await command(identity, '设置时区：Asia/Shanghai')).reply, /已将/);
  const first = JSON.parse(fs.readFileSync(settingsFile(identity), 'utf8'));
  assert.equal(first.clock.time_zone, 'Asia/Shanghai');
  assert.equal(readClock(identity).timezone_source, 'confirmed_setting');
  const utc = readClock(identity, { time_zone: 'UTC' }); assert.equal(utc.time_zone, 'UTC');
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile(identity), 'utf8')), first);
});
test('two private spaces keep distinct timezone settings', async () => {
  const a = who(), b = who(); await command(a, '设置时区：Asia/Shanghai'); await command(b, '设置时区：America/New_York');
  assert.equal(readClock(a).time_zone, 'Asia/Shanghai'); assert.equal(readClock(b).time_zone, 'America/New_York');
});
test('parallel updates retain serial revisions and existing companion fields', async () => {
  const identity = who(); fs.mkdirSync(path.dirname(settingsFile(identity)), { recursive: true });
  fs.writeFileSync(settingsFile(identity), JSON.stringify({ sentinel: 'preserved' }));
  await Promise.all([command(identity, '设置时区：UTC'), command(identity, '设置时区：Asia/Shanghai')]);
  const saved = JSON.parse(fs.readFileSync(settingsFile(identity), 'utf8'));
  assert.equal(saved.sentinel, 'preserved'); assert.equal(saved.clock.revision, 2); assert.equal(saved.clock.time_zone, 'Asia/Shanghai');
});
test('clear removes the effective timezone and preserves monotonic revisions', async () => {
  const identity = who(); await command(identity, '设置时区：UTC'); await command(identity, '清除时区');
  assert.equal(readClock(identity).status, 'timezone_required');
  await command(identity, '设置时区：Asia/Shanghai');
  assert.equal(readClock(identity).timezone_revision, 3);
});
test('settings survive a fresh Node process without initializing a memory engine', async () => {
  const identity = who(); await command(identity, '设置时区：Asia/Shanghai');
  const module = new URL('../dsh-hymemory-plugin/clock.js', import.meta.url).href;
  const script = `import {readClock} from ${JSON.stringify(module)}; process.stdout.write(JSON.stringify(readClock(${JSON.stringify(identity)})));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: process.env, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr); const data = JSON.parse(r.stdout);
  assert.equal(data.time_zone, 'Asia/Shanghai'); assert.equal(data.timezone_revision, 1);
});
test('unbound groups and non-controller members cannot change the group setting', async () => {
  const group = qqIdentity({ appId: 'clock-test', scope: 'group', peerId: 'room-a', senderId: 'controller' });
  assert.match((await command(group, '设置时区：UTC')).reply, /只能/);
  assert.equal(fs.existsSync(settingsFile(group)), false);
  saveRegistry({ rooms: { [memoryNamespace(group)]: { enabled: true, controller: 'controller' } } });
  assert.match((await command(group, '设置时区：UTC')).reply, /已将/);
  const other = qqIdentity({ ...group, senderId: 'member' });
  assert.match((await command(other, '设置时区：Asia/Shanghai')).reply, /只能/);
  assert.equal(readClock(other).time_zone, 'UTC');
  assert.equal(readClock(who()).status, 'timezone_required');
});
test('a bound group setting remains separate from another group', async () => {
  const a = qqIdentity({ appId: 'clock-test', scope: 'group', peerId: 'room-b', senderId: 'owner' });
  const b = qqIdentity({ ...a, peerId: 'room-c' });
  saveRegistry({ rooms: { [memoryNamespace(a)]: { enabled: true, controller: 'owner' }, [memoryNamespace(b)]: { enabled: true, controller: 'owner' } } });
  await command(a, '设置时区：UTC'); await command(b, '设置时区：Asia/Shanghai');
  assert.equal(readClock(a).time_zone, 'UTC'); assert.equal(readClock(b).time_zone, 'Asia/Shanghai');
});
test('pending deletion blocks clock reads and raw setting changes', async () => {
  const identity = who(); await command(identity, '设置时区：UTC');
  const before = fs.readFileSync(settingsFile(identity), 'utf8');
  db.prepare('INSERT INTO privacy_operations VALUES(?,?,?)').run('pending-1', memoryNamespace(identity), 'pending');
  assert.throws(() => readClock(identity), /ClockPrivacyPending/);
  assert.match((await command(identity, '设置时区：Asia/Shanghai')).reply, /清理/);
  assert.equal(fs.readFileSync(settingsFile(identity), 'utf8'), before);
});
test('a stale tool turn cannot run after a privacy revision changes', async () => {
  const identity = who(); const registered = []; installClock({ get: n => n === 'tools' ? { register: d => registered.push(d) } : { section() {} } });
  const agent = { [Symbol.for('qqbot.identity')]: identity, [Symbol.for('qqbot.evidence')]: { identity, privacyVersion: 0, inboundIds: [] } };
  db.prepare('INSERT INTO privacy_spaces VALUES(?,?)').run(memoryNamespace(identity), 1);
  await assert.rejects(registered[0].execute({ time_zone: 'UTC' }, { agent }), /QQPrivacyContextExpired/);
});
test('absence of a deleted companion file requires a new explicit timezone', async () => {
  const identity = who(); await command(identity, '设置时区：UTC');
  const file = settingsFile(identity); assert.ok(file.startsWith(temp + path.sep)); fs.unlinkSync(file);
  assert.equal(readClock(identity).status, 'timezone_required');
});
test('ordinary chat and time reads never persist fresh clock samples', async () => {
  const identity = who(); await command(identity, '设置时区：UTC'); const before = fs.readFileSync(settingsFile(identity), 'utf8');
  assert.equal(await command(identity, '你好，今天开心吗'), null);
  readClock(identity); readClock(identity, { operation: 'resolve', expression: '明天' });
  assert.equal(fs.readFileSync(settingsFile(identity), 'utf8'), before);
});
test('raw DST overlap choices produce deterministic direct-command replies', async () => {
  const identity = who();
  const earlier = await command(identity, '时区换算：2026-11-01 01:30 | America/New_York | UTC | 较早');
  const later = await command(identity, '时区换算：2026-11-01 01:30 | America/New_York | UTC | 较晚');
  assert.match(earlier.reply, /05:30:00\+00:00/); assert.match(later.reply, /06:30:00\+00:00/);
});
test('clock queries are handled even during memory service outage, without an HTTP request', async t => {
  const identity = who(); let calls = 0; t.mock.method(globalThis, 'fetch', () => { calls++; throw Error('network forbidden'); });
  const reply = await beforeQQTurn({ identity, text: 'UTC时间', messageId: 'clock-direct' });
  assert.equal(reply.handled, true); assert.match(reply.reply, /UTC/); assert.equal(calls, 0);
});
test('time control originals are archived but do not queue long-term extraction', async () => {
  const identity = who(); const context = { message: { kind: 'c2c', senderId: identity.peerId, messageId: 'clock-evidence', content: 'UTC时间', timestamp: '2026-10-26T10:00:00Z' }, state: {} };
  let handled = false;
  await archiveQQInbound(context, async () => { handled = (await beforeQQTurn({ identity, text: 'UTC时间' })).handled; }, identity.appId);
  assert.equal(handled, true);
  const evidence = new DatabaseSync(path.join(process.env.QQBOT_EVIDENCE_DIR, 'qq-evidence.sqlite3'), { readOnly: true });
  try {
    const row = evidence.prepare('SELECT text,eligible FROM evidence_events WHERE namespace=? AND role=?').get(memoryNamespace(identity), 'user');
    assert.equal(row.text, 'UTC时间'); assert.equal(row.eligible, 0);
    assert.equal(evidence.prepare('SELECT count(*) AS n FROM evidence_jobs WHERE namespace=?').get(memoryNamespace(identity)).n, 0);
  } finally { evidence.close(); }
});
test('tool exposes only read operations and validates caller-selected fields', async () => {
  const identity = who(), definitions = [], sections = [];
  installClock({ get: n => n === 'tools' ? { register: d => definitions.push(d) } : { section: d => sections.push(d) } });
  const tool = definitions[0]; assert.equal(tool.name, 'qqbot_clock'); assert.equal(definitions.length, 1);
  assert.deepEqual(tool.parameters.properties.operation.enum, ['now','resolve','convert','countdown']);
  await assert.rejects(tool.execute({ time_zone: 'UTC' }, { agent: {} }), /QQIdentityRequired/);
  assert.throws(() => readClock(identity, { time_zone: 'UTC', bank: 'someone-else' }), /ClockArgumentsInvalid/);
  const agent = { [Symbol.for('qqbot.identity')]: identity };
  const r = JSON.parse(await tool.execute({ time_zone: 'UTC' }, { agent }));
  assert.equal(r.status, 'ok'); assert.equal(fs.existsSync(settingsFile(identity)), false);
  assert.equal(sections[0].text({ agent: {} }), '');
});
test('clock uses the existing guard and stays blocked during a history-only turn', () => {
  const identity = who(), root = qqWorkspace(identity);
  const agent = { [Symbol.for('qqbot.identity')]: identity, session: {}, ctx: { get: () => ({ get: () => root }) } };
  assert.equal(qqToolDenial({ agent, name: 'qqbot_clock', arguments: {} }), undefined);
  agent[Symbol.for('qqbot.history.readonly')] = true;
  assert.match(qqToolDenial({ agent, name: 'qqbot_clock', arguments: {} }), /历史问答/);
});
test('registered schemas match the actual installed DSH JSON schema API', async () => {
  const modulePath = 'D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
  const { assertSupportedJsonSchema, validateJsonSchemaValue } = await import(pathToFileURL(modulePath).href);
  let definition; installClock({ get: n => n === 'tools' ? { register: d => { definition = d; } } : { section() {} } });
  assertSupportedJsonSchema(definition.parameters); assertSupportedJsonSchema(definition.output.schema);
  assert.deepEqual(validateJsonSchemaValue(definition.parameters, { time_zone: 'UTC' }), []);
  assert.deepEqual(validateJsonSchemaValue(definition.output.schema, JSON.stringify({ status: 'ok' })), []);
});
test('feature switch prevents queries and writes', async () => {
  const identity = who(); process.env.QQBOT_CLOCK_ENABLED = 'false';
  try { assert.equal(readClock(identity).status, 'disabled'); assert.match((await command(identity, '设置时区：UTC')).reply, /关闭/); assert.equal(fs.existsSync(settingsFile(identity)), false); }
  finally { process.env.QQBOT_CLOCK_ENABLED = 'true'; }
});
