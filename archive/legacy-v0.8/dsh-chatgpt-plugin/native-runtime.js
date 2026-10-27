import path from 'node:path';
import {readJson,writeJson} from './native-rpc.js';

// Persist only fixed event metadata. Server messages, prompts and thread IDs never enter this file.
export function recordNativeRuntime(directory,kind,error={}) {
  try {
    const file=path.join(directory,'runtime.json'),state=readJson(file,{}),at=Date.now();
    state.updatedAt=at;
    if(kind==='failure') {
      const code=/^CODEX_[A-Z_]{1,70}$/.test(error.message||'')?error.message:'CODEX_UNAVAILABLE';
      const method=/^[a-zA-Z0-9/_-]{1,80}$/.test(error.rpcMethod||'')?error.rpcMethod:'';
      state.phase='error';state.lastFailure={at,code,method,...(Number.isInteger(error.rpcCode)?{rpcCode:error.rpcCode}:{})};
      console.warn(`[qq-native-codex] ${code} method=${method||'unknown'} rpc=${state.lastFailure.rpcCode??'none'}`);
    } else if(kind==='recovery') {
      state.phase='recovering';state.lastRecovery={at,reason:'active-writer'};
    } else if(kind==='success') {
      state.phase='ready';state.lastSuccessAt=at;
    } else return;
    writeJson(file,state);
  } catch {
    console.warn('[qq-native-codex] diagnostic state unavailable');
  }
}
