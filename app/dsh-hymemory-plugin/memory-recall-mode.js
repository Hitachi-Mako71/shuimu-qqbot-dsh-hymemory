import {read} from './companion-state.js';

// Missing, invalid or unreadable policy must never turn automatic searches on.
export function automaticMemoryRecall(){
  try{return read('conversation-policy.json',{}).memoryRecall?.mode==='automatic';}
  catch{return false;}
}
