import test from 'node:test';
import assert from 'node:assert/strict';
import {decideParticipation, participationDecisionLimits} from '../dsh-hymemory-plugin/participation-model.js';

const valid = {decision: 'WAIT', confidence: 0.75, reasonCode: 'CONTEXT_INCOMPLETE', modelVersion: 'synthetic-test'};
const silent = reasonCode => ({decision: 'SILENT', confidence: 1, reasonCode, modelVersion: 'a0-safe-fallback'});

test('default mock is deterministic and inert', async () => {
  const context = {selectedMessage: {text: 'synthetic question'}, recentGroupConversation: []};
  const first = await decideParticipation(context);
  assert.deepEqual(first, {decision: 'SILENT', confidence: 1, reasonCode: 'MOCK_NO_SEND', modelVersion: 'a0-mock'});
  assert.deepEqual(await decideParticipation(context), first);
});

test('valid injected decision is normalized to the strict response contract', async () => {
  assert.deepEqual(await decideParticipation({}, {decide: async () => ({...valid, ignored: 'not allowed'})}), silent('INVALID_OUTPUT'));
  assert.deepEqual(await decideParticipation({}, {decide: async () => valid}), valid);
  assert.deepEqual(await decideParticipation({}, {decide: async () => JSON.stringify(valid)}), valid);
});

test('timeout, rejection, malformed JSON, NaN and unknown labels fail safely', async () => {
  assert.deepEqual(await decideParticipation({}, {timeoutMs: 10, decide: () => new Promise(() => {})}), silent('TIMEOUT'));
  assert.deepEqual(await decideParticipation({}, {decide: async () => { throw new Error('synthetic'); }}), silent('DECIDER_ERROR'));
  assert.deepEqual(await decideParticipation({}, {decide: async () => '{bad json'}), silent('INVALID_OUTPUT'));
  assert.deepEqual(await decideParticipation({}, {decide: async () => ({...valid, confidence: NaN})}), silent('INVALID_OUTPUT'));
  assert.deepEqual(await decideParticipation({}, {decide: async () => ({...valid, decision: 'SEND'})}), silent('INVALID_OUTPUT'));
});

test('cancellation aborts the decider and returns a safe result', async () => {
  const controller = new AbortController();
  let receivedSignal;
  const result = decideParticipation({}, {
    signal: controller.signal,
    decide: (_context, options) => {
      receivedSignal = options.signal;
      return new Promise(() => {});
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort('synthetic-cancel');
  assert.deepEqual(await result, silent('CANCELLED'));
  assert.equal(receivedSignal.aborted, true);
});

test('already-cancelled signals and oversized input fail closed', async () => {
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await decideParticipation({}, {signal: controller.signal}), silent('CANCELLED'));
  assert.deepEqual(await decideParticipation({text: 'x'.repeat(participationDecisionLimits.maxInputChars + 1)}), silent('INPUT_TOO_LARGE'));
  assert.deepEqual(await decideParticipation({}, {timeoutMs: participationDecisionLimits.maxTimeoutMs + 1}), silent('INVALID_INPUT'));
});

test('cancellation between the initial check and listener registration is not lost', async () => {
  let aborted = false;
  const racingSignal = {
    get aborted() { return aborted; },
    addEventListener(_type, listener) { aborted = true; queueMicrotask(listener); },
    removeEventListener() {},
    reason: 'synthetic-race',
  };
  assert.deepEqual(await decideParticipation({}, {signal: racingSignal, decide: () => new Promise(() => {})}), silent('CANCELLED'));
});

test('concurrent groups are independent and a slow decision does not block another', async () => {
  let releaseSlow;
  const slow = decideParticipation({group: 'synthetic-a'}, {
    timeoutMs: 200,
    decide: () => new Promise(resolve => { releaseSlow = () => resolve(valid); }),
  });
  const fast = await decideParticipation({group: 'synthetic-b'}, {decide: async () => valid});
  assert.deepEqual(fast, valid);
  releaseSlow();
  assert.deepEqual(await slow, valid);
});
