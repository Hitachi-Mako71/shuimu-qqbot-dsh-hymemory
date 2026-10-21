import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { directory, read, write, sanitize } from './companion-state.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const stamp = () => new Date().toISOString();
const worldPath = (key) => {
  if (!/^qq-[a-f0-9]{64}$/.test(key)) throw new Error('InvalidWorldIdentity');
  return `worlds/${key}.json`;
};
export function canon() {
  return JSON.parse(fs.readFileSync(path.resolve(directory(), '../../fiction-canon.json'), 'utf8').replace(/^\uFEFF/, ''));
}
export function loadWorld(key, skipLegacy = false) {
  const current = read(worldPath(key), null);
  if (current) return current;
  const pending = [];
  const folder = path.join(directory(), 'journals', key);
  if (!skipLegacy && fs.existsSync(folder)) {
    for (const file of fs.readdirSync(folder).filter((p) => /^\d{4}-\d{2}-\d{2}\.json$/.test(p)).sort()) {
      for (const item of read(`journals/${key}/${file}`, [])) {
        if (item.id && item.detail) pending.push({ id: item.id, date: item.date, file });
      }
    }
  }
  const oldStory = read(`people/${key}.json`, {})?.story;
  if (!skipLegacy && oldStory?.history?.length) {
    pending.push({ id: `legacy-story-${digest(oldStory.startedAt || oldStory.scene).slice(0, 24)}`, type: 'story',
      snapshot: { id: `legacy-story-${digest(oldStory.startedAt || oldStory.scene).slice(0, 24)}`, kind: 'fiction', channel: 'story',
        date: (oldStory.startedAt || new Date().toISOString()).slice(0, 10), time: '00:00',
        detail: oldStory.history.map((m) => `${m.role}: ${m.text}`).join('\n').slice(-12000),
        message: oldStory.history.filter((m) => m.role === 'assistant').at(-1)?.text || '', activity: oldStory.scene } });
  }
  const world = { schema: 1, epoch: randomUUID(), revision: 0, episodeCount: 0, facts: {}, threads: {}, events: {},
    records: {}, pendingIndex: [], pendingClears: [], migration: pending, history: [], audit: [], createdAt: stamp() };
  saveWorld(key, world);
  return world;
}
export function saveWorld(key, world) { world.updatedAt = stamp(); write(worldPath(key), world); }
function indexRecord(world, id, content, meta) {
  world.records[id] = { id, content: sanitize(content, 7000), meta: { fiction: true, ...meta } };
  if (!world.pendingIndex.includes(id)) world.pendingIndex.push(id);
}
export function activeRecords(world) {
  const ids = new Set([
    ...Object.values(world.facts).map((r) => r.recordId),
    ...Object.values(world.threads).map((r) => r.recordId),
    ...Object.values(world.events).filter((r) => !r.quarantined).map((r) => r.recordId),
  ]);
  return [...ids].map((id) => world.records[id]).filter(Boolean);
}
export function worldContext(world) {
  const facts = Object.values(world.facts).map((f) => ({ id: f.id, key: f.key, label: f.label, value: f.value, source: f.source, revision: f.revision }));
  const open = Object.values(world.threads).filter((t) => ['planned', 'active'].includes(t.status));
  const closed = Object.values(world.threads).filter((t) => ['completed', 'canceled'].includes(t.status)).slice(-24);
  return { protectedPersona: canon(), confirmedWorldFacts: facts, unfinishedEvents: open.slice(-32), closedEvents: closed,
    legacyEntriesAwaitingReview: world.migration.length, worldRevision: world.revision };
}
const normalized = (text) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export function validateChanges(world, draft, evidenceText) {
  if (!Array.isArray(draft.facts) || !Array.isArray(draft.threads) || draft.facts.length > 8 || draft.threads.length > 5) throw new Error('InvalidWorldChanges');
  const newKeys = new Set();
  const threadIds = new Set();
  for (const f of draft.facts) {
    if (!f || typeof f.key !== 'string' || !/^(?:world|place|pet|plant|book|npc|object|story)\.[a-z0-9_.-]{1,90}$/.test(f.key)
        || typeof f.value !== 'string' || !f.value.trim() || f.value.length > 200 || typeof f.label !== 'string' || !f.label.trim() || f.label.length > 80
        || typeof f.evidence !== 'string' || f.evidence.length < 2 || !evidenceText.includes(f.evidence)) throw new Error('UnsupportedFactProposal');
    if (newKeys.has(f.key)) throw new Error('DuplicateFactProposal');
    if (/\.(?:current|today|now|status|progress|mood)(?:\.|$)/.test(f.key)) throw new Error('MutableStateBelongsToEventLedger');
    newKeys.add(f.key);
    const existing = world.facts[f.key];
    if (existing && normalized(existing.value) !== normalized(f.value)) throw new Error(`ConfirmedFactCannotChange:${f.key}=${existing.value}`);
    for (const previous of Object.values(world.facts)) {
      if (normalized(previous.label) === normalized(f.label) && normalized(previous.value) !== normalized(f.value)) throw new Error('FactAliasConflict');
    }
  }
  if (Object.keys(world.facts).length + [...newKeys].filter((k) => !world.facts[k]).length > 128) throw new Error('WorldFactCapacity');
  for (const t of draft.threads) {
    if (!t || !/^[a-z0-9][a-z0-9_-]{0,70}$/.test(t.id || '') || t.id === 'constructor' || threadIds.has(t.id)
        || !['planned', 'active', 'completed', 'canceled'].includes(t.status) || typeof t.title !== 'string' || !t.title.trim() || t.title.length > 100
        || typeof t.progress !== 'string' || !t.progress.trim() || t.progress.length > 320 || typeof t.evidence !== 'string' || !evidenceText.includes(t.evidence) || t.evidence.length < 2) throw new Error('InvalidEventTransition');
    threadIds.add(t.id);
    const old = world.threads[t.id];
    if (old && ['completed', 'canceled'].includes(old.status) && old.status !== t.status) throw new Error(`ClosedEventCannotReopen:${t.id}`);
    if (old && normalized(old.title) !== normalized(t.title)) throw new Error('EventIdentityCannotChange');
    if (Object.values(world.threads).some((p) => p.id !== t.id && normalized(p.title) === normalized(t.title))) throw new Error('DuplicateEventIdentity');
  }
}
export function commitEpisode(key, world, episode, draft, verification, { legacy = false, quarantine = false } = {}) {
  const id = `E${digest(episode.id).slice(0, 24)}`;
  if (world.events[id]) return world.events[id];
  if (!quarantine) validateChanges(world, draft, `${episode.detail}\n${episode.message || ''}`);
  world.revision += 1;
  world.episodeCount += 1;
  const source = { eventId: id, originalId: episode.id, date: episode.date, time: episode.time,
    journal: episode.channel === 'story' ? 'story-ledger' : `journals/${key}/${episode.date}.json`, verification: verification.kind };
  if (!quarantine) {
    for (const f of draft.facts) {
      if (world.facts[f.key]) continue;
      const fact = { id: `F${digest(f.key).slice(0, 12)}`, key: f.key, label: sanitize(f.label, 80), value: sanitize(f.value, 200),
        revision: 1, source, createdAt: stamp() };
      fact.recordId = `${fact.id}.r1`;
      world.facts[f.key] = fact;
      indexRecord(world, fact.recordId, `【虚构世界设定】${fact.label}：${fact.value}。来源事件：${id}。`, { type: 'world-fact', key: fact.key, revision: 1, source });
    }
    for (const t of draft.threads) {
      const old = world.threads[t.id];
      const thread = { id: t.id, title: sanitize(t.title, 100), status: t.status, progress: sanitize(t.progress, 320), revision: (old?.revision || 0) + 1, source, updatedAt: stamp() };
      thread.recordId = `T${digest(t.id).slice(0, 16)}.r${thread.revision}`;
      world.threads[t.id] = thread;
      world.history.push({ type: 'event-transition', id: t.id, from: old?.status || null, to: thread.status, source, revision: world.revision });
      indexRecord(world, thread.recordId, `【虚构事件进度】${thread.title}，状态${thread.status}，${thread.progress}。来源事件：${id}。`, { type: 'event-state', source, revision: thread.revision });
    }
  }
  const event = { ...episode, eventId: id, recordId: id, summary: sanitize(draft.summary || episode.detail, 450), source,
    quarantined: quarantine, legacy, checkedAt: stamp(), verification };
  world.events[id] = event;
  if (!quarantine) indexRecord(world, id, `【水木虚构情景记忆】${episode.date} ${episode.time}，${event.summary}。来源事件：${id}。`, { type: 'episodic', source, channel: episode.channel || 'life' });
  saveWorld(key, world); // Commit the canonical record before publishing or indexing it.
  return event;
}
export function rejectEpisode(key, world, reason) {
  world.audit.push({ at: stamp(), type: 'candidate-rejected', reason: sanitize(reason, 300) });
  world.audit = world.audit.slice(-100);
  saveWorld(key, world);
}
export function correctFact(key, world, id, value) {
  if (!value.trim() || value.trim().length > 200) throw new Error('InvalidWorldFactValue');
  const fact = Object.values(world.facts).find((f) => f.id === id);
  if (!fact) throw new Error('UnknownWorldFact');
  const previous = fact.value;
  fact.value = sanitize(value.trim(), 200); fact.revision += 1; fact.updatedAt = stamp();
  fact.source = { type: 'explicit-user-correction', at: stamp(), previousSource: fact.source };
  fact.recordId = `${fact.id}.r${fact.revision}`;
  world.revision += 1;
  world.history.push({ type: 'user-correction', factId: id, previous, value: fact.value, at: stamp(), revision: world.revision });
  indexRecord(world, fact.recordId, `【用户明确更正的虚构世界设定】${fact.label}：${fact.value}。版本${fact.revision}。`, { type: 'world-fact', key: fact.key, revision: fact.revision, source: fact.source });
  saveWorld(key, world);
  return fact;
}
export function resetWorld(key) {
  const old = loadWorld(key);
  const fresh = { schema: 1, epoch: randomUUID(), revision: 0, episodeCount: 0, facts: {}, threads: {}, events: {}, records: {},
    pendingIndex: [], pendingClears: [...old.pendingClears, old.epoch], migration: [], history: [], audit: [], createdAt: stamp() };
  saveWorld(key, fresh);
}
export async function memoryRequest(route, body, timeout = 7000) {
  const base = new URL(process.env.MEMORY_BRIDGE_URL || 'http://127.0.0.1:8765');
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('FictionIndexMustBeLocal');
  const response = await fetch(new URL(`/fiction/${route}`, base), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MEMORY_BRIDGE_TOKEN}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error('FictionIndexUnavailable');
  return data;
}
export async function flushWorld(key) {
  const world = loadWorld(key);
  for (const epoch of [...world.pendingClears]) {
    await memoryRequest('clear', { user_id: key, epoch });
    world.pendingClears = world.pendingClears.filter((e) => e !== epoch);
    saveWorld(key, world);
  }
  const active = new Set(activeRecords(world).map((r) => r.id));
  const pending = world.pendingIndex.filter((id) => active.has(id)).slice(0, 50);
  if (pending.length) {
    await memoryRequest('sync', { user_id: key, epoch: world.epoch, records: pending.map((id) => world.records[id]) });
    world.pendingIndex = world.pendingIndex.filter((id) => !pending.includes(id) && active.has(id));
    saveWorld(key, world);
  }
}
export async function searchWorld(key, world, query) {
  const active = activeRecords(world);
  const byId = new Map(active.map((r) => [r.id, r]));
  try {
    const result = await memoryRequest('search', { user_id: key, epoch: world.epoch, query: sanitize(query, 1500), limit: 10 });
    const hits = result.memories.filter((m) => byId.has(m.record_id)).map((m) => ({ ...byId.get(m.record_id), memoryId: m.memory_id, score: m.score }));
    if (hits.length) return { method: 'hy-memory', records: hits };
  } catch {}
  const clean = query.replace(/\s+/g, '');
  const tokens = [...new Set(Array.from({ length: Math.max(clean.length - 1, 0) }, (_, i) => clean.slice(i, i + 2)))];
  const ranked = active.map((r, i) => ({ r, i, score: tokens.reduce((n, t) => n + Number(r.content.includes(t)), 0) }))
    .sort((a, b) => b.score - a.score || b.i - a.i);
  return { method: 'local-ledger', records: ranked.filter((r) => r.score > 0).slice(0, 8).map(({ r }) => r) };
}
