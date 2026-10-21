import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const directory = () => process.env.QQBOT_COMPANION_DIR || path.resolve('data/companion');
export const namespace = (identity) => identity?.appId && identity?.peerId && ['c2c', 'group'].includes(identity.scope)
  ? `qq-${createHash('sha256').update(JSON.stringify([identity.appId, identity.scope, identity.peerId])).digest('hex')}` : '';
export function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(directory(), name), 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export function write(name, value) {
  const target = path.join(directory(), name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temporary, target);
}
const locks = new Map();
export function withPerson(key, action) {
  if (!/^qq-[a-f0-9]{64}$/.test(key)) return Promise.reject(new Error('InvalidCompanionIdentity'));
  const task = (locks.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const state = read(`people/${key}.json`, { moments: [], life: [], story: null, lastInboundAt: 0, deliveries: [] });
    return action(state, () => write(`people/${key}.json`, state));
  });
  locks.set(key, task);
  task.finally(() => { if (locks.get(key) === task) locks.delete(key); }).catch(() => {});
  return task;
}
export function clock(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), time: `${parts.hour}:${parts.minute}` };
}
export const defaults = { enabled: false, minMinutes: 20, maxMinutes: 30, hourlyMax: 3, dailyMax: 42, quietStart: 23, quietEnd: 9 };
export const settings = () => ({ ...defaults, ...read('settings.json', {}) });
export const nextDelay = (s) => Math.round((s.minMinutes + Math.random() * (s.maxMinutes - s.minMinutes)) * 60000);
export function sanitize(value, limit = 1800) {
  let text = String(value || '');
  for (const token of [process.env.QQBOT_SECRET, process.env.MEMORY_BRIDGE_TOKEN]) if (token) text = text.split(token).join('[凭证已隐藏]');
  return text.slice(0, limit);
}
