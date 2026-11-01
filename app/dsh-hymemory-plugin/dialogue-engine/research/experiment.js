import { generateDialogueReply } from '../index.js';
// Explicitly invoked offline only. Never reads live chat, queues sends or chooses a provider.
export async function runExperiment(cases, { generate, recall, signal, modelVersion, seed } = {}) {
  if (!modelVersion) throw Error('PinnedModelVersionRequired');
  const results=[];
  for(const scene of cases) for(const variant of ['A','B','C','D']) {
    const started=performance.now();
    const result=await generateDialogueReply(scene.input,{generate,recall,signal,variant,separatePlanning:['C','D'].includes(variant)});
    results.push({sceneId:scene.id,origin:scene.origin,variant,modelVersion,seed:seed??null,elapsedMs:performance.now()-started,...result});
  }
  return results;
}
