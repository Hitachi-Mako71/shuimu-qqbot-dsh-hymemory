const inertDecision = Object.freeze({
  decision: 'SILENT',
  confidence: 1,
  reasonCode: 'DECIDER_ERROR',
  modelVersion: 'a0-safe-fallback',
});

async function continueRoute(source, decision, continueWithReply) {
  const value = typeof continueWithReply === 'function' ? await continueWithReply() : undefined;
  return {continueFlow: true, source, decision, value};
}

/** Gate ambient group replies before recall or generation; never grants send permission. */
export async function routeParticipation({
  mode = 'off',
  bypass = false,
  decisionContext,
  decide,
  onShadowDecision,
  continueWithReply,
} = {}) {
  if (mode === 'off' || bypass) {
    return continueRoute(bypass ? 'direct' : 'legacy', null, continueWithReply);
  }
  if (!['shadow', 'mock', 'pilot'].includes(mode)) {
    return continueRoute('legacy', null, continueWithReply);
  }

  let decision = inertDecision;
  try {
    if (typeof decide === 'function') {
      decision = await decide(decisionContext, {mode: 'mock'});
    }
  } catch {
    decision = inertDecision;
  }

  if (mode === 'shadow') {
    try { onShadowDecision?.(decision); } catch {}
    return continueRoute('shadow', decision, continueWithReply);
  }

  if (decision?.decision !== 'SPEAK') {
    return {continueFlow: false, source: 'mock', decision};
  }
  return continueRoute('mock', decision, continueWithReply);
}
