import {createHash} from 'node:crypto';
import {read} from './companion-state.js';

export const personaPolicy=()=>read('persona-policy.json',{});
const retired=/大肥鱼|我(?:这|是|像|成了).{0,8}条鱼|鱼粮|掉鳞|鳞片|摇.{0,3}尾巴|摆.{0,3}尾巴|我没有主人|我(?:只是|就是).{0,8}没有主人/;
export function personaMaterialAllowed(text,seq=0) {
  const policy=personaPolicy();
  if(!policy.revision)return true;
  if(seq && seq>(policy.throughSeq||0))return true;
  return !retired.test(String(text||''));
}
export function personaSessionId(current) {
  const revision=personaPolicy().revision;if(!revision)return current;
  const hash=createHash('sha256').update(JSON.stringify([current,'qq-persona',revision])).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
}
