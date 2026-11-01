export function inspectResponse(text, { allowSilence = false } = {}) {
  if (typeof text !== 'string') throw Error('DialogueResponseTypeInvalid');
  const body = String(text || '').trim();
  const silence = /^(?:<NO_REPLY>|NO_REPLY|\[NO_REPLY\])$/i.test(body);
  if (!body || (silence && !allowSilence)) throw Error('DialogueEmptyResponse');
  const flags = [];
  if (/[?？]/u.test(body)) flags.push('question_requires_review');
  if (/听起来你|你这句话|今晚这句|你刚才.*然后/u.test(body)) flags.push('meta_commentary_requires_review');
  if (body.length > 140) flags.push('length_requires_context_review');
  // Diagnostics are not a humanity score and never mechanically delete sentences.
  return { action: silence ? 'skip' : 'reply', text: silence ? '' : body, diagnostics: flags };
}
