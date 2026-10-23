import fs from 'node:fs';
import path from 'node:path';
export function modelRoute() {
  const fallback = { provider: process.env.MEMORY_DSH_PROVIDER || 'deepseek-account', model: process.env.MEMORY_DSH_MODEL || 'deepseek-flash' };
  try {
    const file = process.env.QQBOT_MODEL_ROUTING_FILE || path.resolve(process.env.QQBOT_COMPANION_DIR || 'data/companion', '../model-routing.json');
    const route = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (['codex', 'chatgpt-plan', 'chatgpt-chat', 'chatgpt-chat-work'].includes(route.provider) && typeof route.model === 'string' && /^[A-Za-z0-9._:-]{1,150}$/.test(route.model)) {
      if (route.provider === 'chatgpt-chat-work') return fallback;
      return { provider: route.provider, model: route.model };
    }
    if (route.provider === 'deepseek-account') return fallback;
  } catch (e) { if (e.code !== 'ENOENT') console.warn('[qq-model-route] invalid configuration; using installed model'); }
  return fallback;
}
