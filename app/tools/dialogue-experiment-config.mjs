// Explicit per-side settings prevent a prompt ablation from also changing call count.
export function generationOptions(options,side,retrieveExamples){
  if(!['baseline','candidate'].includes(side))throw Error('ExperimentSideInvalid');
  const prefix=side==='baseline'?'reference-':'';
  return {
    inputFormat:options[prefix+'format']||'json',
    stylePreset:options[prefix+'style']||(side==='candidate'?'candidate':'stable'),
    separatePlanning:options[prefix+'planning']==='true',
    reviewReply:options[prefix+'review']==='true',
    retrieveExamples:options[prefix+'semantic']==='true'?retrieveExamples:undefined,
  };
}
