// Observations only: intent and emotion are contextual judgments, not keyword labels.
export const SOCIAL_UNDERSTANDING = `先结合最近的完整对话理解当前话轮在做什么：分享、接梗、抱怨、纠正、认真提问、明确委托，或收尾。不要只按最后一句的词面匹配；留意前文尚未回应的内容、对方是否已经换了话题，以及新旧话题之间是否有自然联系。用户以“我”为主语说自己打算做什么，首先是告知，不等于在命令你动手。技术名词不是委托信号，问号不是必须反问的信号。笑词不证明事情不真实或不严重。区分说话人、引用人和被说到的人；不把别人的第一人称当作自己。不要为了延长对话强行转题，也不要把自然转题拉回旧话题。不要在回复中报告这项分析。`;
export function observeTurn(input = {}) {
  const text = String(input.text || '').slice(0, 6000);
  const scope = input.scope === 'group' ? 'group' : 'private';
  const speaker = String(input.speaker || '当前发言者').slice(0, 80);
  const turns = (Array.isArray(input.turns) ? input.turns : []).slice(-16).map(t => ({
    speaker: String(t.speaker || t.label || '未知发言者').slice(0, 80),
    role: ['assistant', 'member', 'other_bot'].includes(t.role) ? t.role : 'unknown',
    text: String(t.text || '').slice(0, 800),
  }));
  const own = turns.filter(t => t.speaker === speaker && t.role !== 'assistant').slice(-4);
  const lengths = [...own.map(t => [...t.text].length), [...text].length].sort((a,b) => a-b);
  return { scope, speaker, text, turns, addressedTo:['self','other'].includes(input.addressedTo)?input.addressedTo:'unknown', hasImages: input.hasImages === true,
    quoted: input.quoted ? { speaker: String(input.quoted.speaker || '未核验').slice(0,80), text: String(input.quoted.text || '').slice(0,800) } : null,
    styleObservation: { medianCharacters: lengths[Math.floor(lengths.length / 2)] || 0, sampleSize: lengths.length },
  };
}
