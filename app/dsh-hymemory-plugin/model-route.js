import fs from 'node:fs';
import path from 'node:path';
const routingFile = () => process.env.QQBOT_MODEL_ROUTING_FILE || path.resolve(process.env.QQBOT_COMPANION_DIR || 'data/companion', '../model-routing.json');
export function conversationMode() {
  try {
    const route = JSON.parse(fs.readFileSync(routingFile(), 'utf8').replace(/^\uFEFF/, ''));
    return route.mode === undefined || route.mode === 'chat' ? 'chat' : 'work';
  } catch (error) { return error.code === 'ENOENT' ? 'chat' : 'work'; }
}
export function memoryModelRoute() {
  const model = process.env.MEMORY_DSH_MODEL || 'deepseek-flash';
  if (!/^[A-Za-z0-9._:-]{1,150}$/.test(model)) throw Error('MemoryModelInvalid');
  return { provider: 'deepseek-account', model };
}
export function modelRoute() {
  const fallback = { provider: 'deepseek-account', model: process.env.QQBOT_MODEL || 'deepseek-flash' };
  try {
    const file = routingFile();
    const route = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const model = route.deepseek?.model || (route.provider === 'deepseek-account' ? route.model : '') || fallback.model;
    if (typeof model === 'string' && /^[A-Za-z0-9._:-]{1,150}$/.test(model)) return { provider: 'deepseek-account', model };
  } catch (e) { if (e.code !== 'ENOENT') console.warn('[qq-model-route] invalid configuration; using installed model'); }
  return { provider: 'deepseek-account', model: fallback.model };
}
