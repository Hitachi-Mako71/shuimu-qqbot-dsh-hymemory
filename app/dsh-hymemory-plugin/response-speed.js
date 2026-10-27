// Attach to QQ agents only; apply after inherited request resolution, including
// resumed sessions whose stored effort may differ from profile defaults.
import { modelRoute } from './model-route.js';
const configured = new WeakSet();
export function configureQQResponseSpeed(agent) {
  if (configured.has(agent)) return;
  agent.ctx.on('agent/request', async (_payload, next) => {
    const resolved = await next();
    return { ...resolved, ...modelRoute(), reasoningEffort: process.env.QQBOT_REASONING_EFFORT || 'off' };
  }, { prepend: true });
  configured.add(agent);
}
