import {AsyncLocalStorage} from 'node:async_hooks';
// Runtime cancellation only; never serialized into evidence or settings.
const incoming=new AsyncLocalStorage();
export const qqInboundSignal=()=>incoming.getStore();
export const withQQInboundSignal=(signal,next)=>incoming.run(signal,next);
