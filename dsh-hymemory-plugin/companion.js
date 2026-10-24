import fs from 'node:fs';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { directory, namespace, read, write, withPerson, clock, settings, nextDelay, sanitize } from './companion-state.js';
import { attention, noteInbound, attentionContext } from './companion-attention.js';
import { characterDescription } from './character.js';
import { modelRoute } from './model-route.js';

let runtime, polling = false;

export async function model(system, user, maxTokens = 700, sessionId = undefined) {
  if (!runtime) throw new Error('CompanionNotReady');
  const { BlockAssembler, createUserMessage, createSystemMessage } = await import('@deepseek-ai/dsh-llm');
  let persona = '';
  try { persona = fs.readFileSync(path.resolve(directory(), '../../personality.md'), 'utf8'); } catch {}
  const assembler = new BlockAssembler();
  for await (const chunk of runtime.ctx.get('llm').stream({
    ...modelRoute(), sessionId,
    messages: [createSystemMessage(`${persona}\n【固定角色外貌】\n${characterDescription()}\n${system}\n不编造自己的日常经历，不生成或引用虚构记忆。读书与虚构生活功能已移除。`), createUserMessage({ content: [{ type: 'text', text: user }], source: { kind: 'user' } })],
    reasoningEffort: 'off', maxTokens, signal: AbortSignal.timeout(60000),
  })) assembler.push(chunk);
  if (['error', 'aborted'].includes(assembler.finish.kind)) throw new Error('CompanionModelUnavailable');
  const content = assembler.blocks().filter(block => block.type === 'text').map(block => block.text).join('').trim();
  if (!content) throw new Error('CompanionEmptyText');
  return sanitize(content, 10000);
}

function controls(input, identity) {
  const s = settings();
  const pairing = input.match(/^开启陪伴(?:\s+([A-Z0-9]+))?$/i);
  if (pairing) {
    const key = namespace(identity);
    if (identity.scope !== 'c2c' || (s.owner && s.owner !== key)) return { handled: true, reply: '主动问候只向本机已绑定的主人私聊开放。' };
    if (!s.owner) {
      const digest = createHash('sha256').update((pairing[1] || '').toUpperCase()).digest('hex');
      if (!Number.isFinite(s.pairingExpiresAt) || Date.now() > s.pairingExpiresAt || s.pairingHash?.length !== digest.length
        || !timingSafeEqual(Buffer.from(digest), Buffer.from(s.pairingHash))) return { handled: true, reply: '配对码无效或过期，请在本机重新生成。' };
    }
    s.owner = key; s.target = { scope: 'c2c', targetId: identity.peerId }; s.enabled = true;
    delete s.pairingHash; delete s.pairingExpiresAt; write('settings.json', s);
    return { handled: true, reply: '已开启轻问候。不会编造日常、生成日记或虚构记忆；说“暂停主动消息”就会暂停。' };
  }
  if (!/^(?:暂停主动消息|关闭主动消息|恢复主动消息|开启主动消息|主动消息状态|主动频率(?:\s+(?:高频|正常|轻量))?|安静两小时|我先忙两小时|夜间免打扰|夜间也可以聊)$/.test(input)) return null;
  if (identity.scope !== 'c2c' || s.owner !== namespace(identity)) return { handled: true, reply: '请由已绑定的主人私聊管理主动问候。' };
  if (/^(?:暂停|关闭)主动消息$/.test(input)) s.enabled = false;
  else if (/^(?:恢复|开启)主动消息$/.test(input)) { s.enabled = true; s.snoozeUntil = 0; }
  else if (/^(?:安静两小时|我先忙两小时)$/.test(input)) s.snoozeUntil = Date.now() + 7200000;
  else if (/^夜间/.test(input)) s.quietDisabled = input === '夜间也可以聊';
  else if (/^主动频率\s/.test(input)) Object.assign(s, {
    高频: { minMinutes: 20, maxMinutes: 30, hourlyMax: 3 },
    正常: { minMinutes: 60, maxMinutes: 120, hourlyMax: 1 },
    轻量: { minMinutes: 180, maxMinutes: 360, hourlyMax: 1 },
  }[input.split(/\s+/)[1]]);
  write('settings.json', s);
  return { handled: true, reply: `主动问候：${s.enabled ? '开启' : '暂停'}。不生成虚构生活或虚构记忆；免打扰、频率限制和等待回复规则继续生效。` };
}

export async function recordCompanionInbound({ identity, text = '', messageId = '' }) {
  const key = namespace(identity);
  if (key) await withPerson(key, (state, save) => { noteInbound(state, text.trim(), messageId); save(); });
}

export async function beforeCompanionTurn({ identity, text = '' }) {
  const controlled = controls(text.trim(), identity);
  if (controlled) return controlled;
  const key = namespace(identity);
  if (!key) return null;
  return withPerson(key, state => ({ handled: false, context: attentionContext(state) }));
}

async function poll() {
  if (polling || !runtime) return;
  polling = true;
  try {
    const s = settings(), now = Date.now(), local = clock(now), schedule = read('scheduler.json', {});
    if (!s.enabled || !s.owner || s.target?.scope !== 'c2c' || now < (s.snoozeUntil || 0) || now < (schedule.nextDueAt || 0)) return;
    if (namespace({ appId: runtime.appId, scope: 'c2c', peerId: s.target.targetId }) !== s.owner) return;
    const quiet = s.quietStart === s.quietEnd ? false : s.quietStart > s.quietEnd
      ? local.hour >= s.quietStart || local.hour < s.quietEnd : local.hour >= s.quietStart && local.hour < s.quietEnd;
    if (!s.quietDisabled && quiet) return;
    await withPerson(s.owner, async (state, save) => {
      const waiting = attention(state, now);
      if (['busy', 'waiting'].includes(waiting.mode) || now - state.lastInboundAt < 5 * 60000) return;
      const deliveries = state.deliveries || [];
      if (deliveries.filter(d => now - d.at < 3600000).length >= s.hourlyMax || deliveries.filter(d => d.date === local.date).length >= s.dailyMax) return;
      schedule.nextDueAt = now + nextDelay(s); write('scheduler.json', schedule);
      // A lightweight greeting is not a generated episode or a memory record.
      const content = waiting.mode === 'check-in' ? '我在这里呢。你忙完、想聊的时候再来找我就好。' : '想和你聊会儿。今天有什么想说的，或者要我帮忙的事吗？';
      if (!settings().enabled || Date.now() < (settings().snoozeUntil || 0)) return;
      const receipt = await runtime.sender.sendProactiveMarkdown({ scope: 'c2c', targetId: s.target.targetId }, content);
      if (!receipt?.id) throw Error('GreetingReceiptUnconfirmed');
      state.deliveries = [...deliveries, { at: Date.now(), date: local.date, kind: 'check-in', text: content }].slice(-100);
      save();
      Object.assign(schedule, { lastSuccessAt: new Date().toISOString(), successfulPushes: (schedule.successfulPushes || 0) + 1, blocked: false, message: 'QQ已接受轻问候；没有生成日记或虚构记忆' });
      write('scheduler.json', schedule);
    });
  } catch {
    const schedule = read('scheduler.json', {});
    Object.assign(schedule, { nextDueAt: Date.now() + 6 * 3600000, blocked: true, message: '轻问候发送未确认，暂停自动重试' });
    write('scheduler.json', schedule);
    console.warn('[qq-companion] greeting unavailable');
  } finally { polling = false; }
}

export function registerCompanion(ctx, sender, appId) {
  runtime = { ctx, sender, appId: String(appId) };
  ctx.effect(() => {
    const timer = setInterval(() => { void poll(); }, 15000); timer.unref();
    return () => { clearInterval(timer); runtime = undefined; };
  }, 'qq-companion.lifecycle');
}
