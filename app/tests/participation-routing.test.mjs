import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {routeParticipation} from '../dsh-hymemory-plugin/participation-routing.js';
import {participationMode} from '../dsh-hymemory-plugin/conversation-policy.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-participation-routing-'));
process.env.QQBOT_COMPANION_DIR = path.join(temp, 'companion');
fs.mkdirSync(process.env.QQBOT_COMPANION_DIR, {recursive: true});
test.after(() => {
  assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
  assert.match(path.basename(temp), /^qq-participation-routing-/);
  fs.rmSync(temp, {recursive: true, force: true});
});

const speak = {decision: 'SPEAK', confidence: 0.8, reasonCode: 'DECISION_READY', modelVersion: 'synthetic'};
const silent = {decision: 'SILENT', confidence: 1, reasonCode: 'LOW_RELEVANCE', modelVersion: 'synthetic'};
const wait = {decision: 'WAIT', confidence: 0.6, reasonCode: 'CONTEXT_INCOMPLETE', modelVersion: 'synthetic'};

function downstreamCounters() {
  const calls = {groupRecall: 0, deepSeek: 0, send: 0};
  return {calls, continueWithReply: async () => {
    calls.groupRecall++; calls.deepSeek++; calls.send++;
  }};
}

test('off preserves the legacy continuation and never calls the adapter', async () => {
  const downstream = downstreamCounters(); let adapterCalls = 0;
  const result = await routeParticipation({mode: 'off', decide: async () => { adapterCalls++; return silent; }, ...downstream});
  assert.equal(adapterCalls, 0);
  assert.equal(result.source, 'legacy');
  assert.deepEqual(downstream.calls, {groupRecall: 1, deepSeek: 1, send: 1});
});

test('shadow records only the enumerated decision and does not change legacy routing', async () => {
  const downstream = downstreamCounters(); let recorded; let adapterCalls = 0;
  const result = await routeParticipation({
    mode: 'shadow', decisionContext: {selectedMessage: {text: 'synthetic'}}, ...downstream,
    decide: async (_context, options) => { adapterCalls++; assert.equal(options.mode, 'mock'); return silent; },
    onShadowDecision: decision => { recorded = {decision: decision.decision, reasonCode: decision.reasonCode}; },
  });
  assert.equal(adapterCalls, 1);
  assert.deepEqual(recorded, {decision: 'SILENT', reasonCode: 'LOW_RELEVANCE'});
  assert.equal(result.continueFlow, true);
  assert.equal(result.source, 'shadow');
  assert.deepEqual(downstream.calls, {groupRecall: 1, deepSeek: 1, send: 1});
});

test('mock SILENT and WAIT stop before recall, DeepSeek and send', async () => {
  for (const decision of [silent, wait]) {
    const downstream = downstreamCounters();
    const result = await routeParticipation({mode: 'mock', decide: async () => decision, ...downstream});
    assert.equal(result.continueFlow, false);
    assert.deepEqual(downstream.calls, {groupRecall: 0, deepSeek: 0, send: 0});
  }
});

test('mock SPEAK proceeds to the existing guarded generation and delivery chain', async () => {
  const downstream = downstreamCounters();
  const result = await routeParticipation({mode: 'mock', decide: async () => speak, ...downstream});
  assert.equal(result.continueFlow, true);
  assert.equal(result.source, 'mock');
  assert.deepEqual(downstream.calls, {groupRecall: 1, deepSeek: 1, send: 1});
});

test('direct @ and follow-up events bypass A and preserve the normal Agent route', async t => {
  for (const source of ['platform @', 'recognized direct follow-up']) await t.test(source, async () => {
    const downstream = downstreamCounters(); let adapterCalls = 0;
    const result = await routeParticipation({mode: 'mock', bypass: true, decide: async () => { adapterCalls++; return silent; }, ...downstream});
    assert.equal(adapterCalls, 0);
    assert.equal(result.source, 'direct');
    assert.deepEqual(downstream.calls, {groupRecall: 1, deepSeek: 1, send: 1});
  });
});

test('decider errors fail closed in mock and cannot break shadow continuation', async () => {
  const stopped = downstreamCounters();
  const mock = await routeParticipation({mode: 'mock', decide: async () => { throw Error('synthetic'); }, ...stopped});
  assert.equal(mock.continueFlow, false);
  assert.deepEqual(stopped.calls, {groupRecall: 0, deepSeek: 0, send: 0});

  const shadowDownstream = downstreamCounters();
  const shadow = await routeParticipation({mode: 'shadow', decide: async () => { throw Error('synthetic'); }, ...shadowDownstream});
  assert.equal(shadow.continueFlow, true);
  assert.deepEqual(shadowDownstream.calls, {groupRecall: 1, deepSeek: 1, send: 1});
});

test('runtime participation mode defaults off and accepts only declared modes', async () => {
  assert.equal(participationMode(), 'off');
  const file = path.join(process.env.QQBOT_COMPANION_DIR, 'conversation-policy.json');
  for (const mode of ['off', 'shadow', 'mock', 'pilot']) {
    fs.writeFileSync(file, JSON.stringify({participation: {mode}}));
    assert.equal(participationMode(), mode);
  }
  for (const mode of ['enabled', 'model', '', null]) {
    fs.writeFileSync(file, JSON.stringify({participation: {mode}}));
    assert.equal(participationMode(), 'off');
  }
});
