const DECISIONS = new Set(['SPEAK', 'WAIT', 'SILENT']);
const REASONS = new Set([
  'MOCK_NO_SEND',
  'DECISION_READY',
  'LOW_RELEVANCE',
  'CONTEXT_INCOMPLETE',
  'TIMEOUT',
  'CANCELLED',
  'DECIDER_ERROR',
  'INVALID_OUTPUT',
  'INPUT_TOO_LARGE',
  'INVALID_INPUT',
  'UNAVAILABLE',
]);
const MAX_INPUT_CHARS = 32_768;
const DEFAULT_TIMEOUT_MS = 600;
const MAX_TIMEOUT_MS = 10_000;
const FALLBACK_VERSION = 'a0-safe-fallback';

function safeResult(reasonCode) {
  return {decision: 'SILENT', confidence: 1, reasonCode, modelVersion: FALLBACK_VERSION};
}

function parseOutput(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some(key => !['decision', 'confidence', 'reasonCode', 'modelVersion'].includes(key))) return null;
  if (!DECISIONS.has(value.decision)) return null;
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return null;
  if (!REASONS.has(value.reasonCode)) return null;
  if (typeof value.modelVersion !== 'string' || value.modelVersion.length < 1 || value.modelVersion.length > 64) return null;
  return {
    decision: value.decision,
    confidence: value.confidence,
    reasonCode: value.reasonCode,
    modelVersion: value.modelVersion,
  };
}

function validInput(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return 'INVALID_INPUT';
  let encoded;
  try { encoded = JSON.stringify(context); } catch { return 'INVALID_INPUT'; }
  if (typeof encoded !== 'string') return 'INVALID_INPUT';
  if (encoded.length > MAX_INPUT_CHARS) return 'INPUT_TOO_LARGE';
  return null;
}

/**
 * A0 participation API. The default mock is deliberately inert: it never
 * generates text, calls a model, or grants message-send permission.
 */
export async function decideParticipation(decisionContext, {
  mode = 'mock',
  decide,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
} = {}) {
  const inputError = validInput(decisionContext);
  if (inputError) return safeResult(inputError);
  if (signal?.aborted) return safeResult('CANCELLED');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) return safeResult('INVALID_INPUT');

  const runner = typeof decide === 'function'
    ? decide
    : mode === 'mock'
      ? async () => ({decision: 'SILENT', confidence: 1, reasonCode: 'MOCK_NO_SEND', modelVersion: 'a0-mock'})
      : null;
  if (!runner) return safeResult('UNAVAILABLE');

  const controller = new AbortController();
  let timer;
  let removeAbort = () => {};
  let onTimeout;
  const interrupted = new Promise(resolve => {
    onTimeout = () => {
      controller.abort('timeout');
      resolve({kind: 'timeout'});
    };
    timer = setTimeout(onTimeout, timeoutMs);
    timer?.unref?.();
    if (signal) {
      const onAbort = () => {
        controller.abort(signal.reason);
        resolve({kind: 'cancelled'});
      };
      signal.addEventListener('abort', onAbort, {once: true});
      removeAbort = () => signal.removeEventListener('abort', onAbort);
      if (signal.aborted) onAbort();
    }
  });

  try {
    const outcome = await Promise.race([
      Promise.resolve().then(() => runner(decisionContext, {signal: controller.signal})).then(
        value => ({kind: 'result', value}),
        () => ({kind: 'error'}),
      ),
      interrupted,
    ]);
    if (outcome.kind === 'timeout') return safeResult('TIMEOUT');
    if (outcome.kind === 'cancelled') return safeResult('CANCELLED');
    if (outcome.kind === 'error') return safeResult('DECIDER_ERROR');
    return parseOutput(outcome.value) || safeResult('INVALID_OUTPUT');
  } finally {
    clearTimeout(timer);
    removeAbort();
  }
}

export const participationDecisionLimits = Object.freeze({maxInputChars: MAX_INPUT_CHARS, defaultTimeoutMs: DEFAULT_TIMEOUT_MS, maxTimeoutMs: MAX_TIMEOUT_MS});
