import fs from 'node:fs';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';

// Local state is private data, separate from the distributable plugin.
const directory = () => process.env.QQBOT_CODEX_RELAY_DIR || path.resolve('data/codex-relay');
let transport;
let busy = false;
let serial = Promise.resolve();
let lastPush = 0;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const ownerKey = (identity) => hash(JSON.stringify([identity.appId, identity.scope, identity.peerId]));
function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(directory(), name), 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function save(state) {
  fs.mkdirSync(directory(), { recursive: true });
  const file = path.join(directory(), 'state.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}
const empty = () => ({ enabled: false, owner: '', offset: 0, outbox: [], incoming: [], sent: 0 });
function config() {
  const value = read('config.json', null);
  if (!value) return null;
  if (!/^[0-9a-f-]{36}$/i.test(value.threadId) || !path.isAbsolute(value.rollout) || !path.isAbsolute(value.codexPath)
      || !path.basename(value.rollout).endsWith(`${value.threadId}.jsonl`)) throw new Error('RelayConfigurationError');
  return value;
}
function redact(text) {
  for (const value of [process.env.QQBOT_SECRET, process.env.MEMORY_BRIDGE_TOKEN]) {
    if (value) text = text.split(value).join('[凭证已隐藏]');
  }
  return text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/gi, 'Bearer [已隐藏]');
}
function chunks(text) {
  const chars = Array.from(text);
  const result = [];
  for (let i = 0; i < chars.length; i += 2600) result.push(chars.slice(i, i + 2600).join(''));
  return result;
}
function endOfFile(cfg) { return fs.statSync(cfg.rollout).size; }

// Only completed, explicitly public assistant messages are forwarded.
// Reasoning, tools, user input, attachments and credentials never enter this parser.
function collect(cfg, state) {
  const size = endOfFile(cfg);
  if (size < state.offset) { state.offset = size; state.notice = '会话记录发生轮换，已跳到新记录末尾。'; return; }
  if (size === state.offset || state.outbox.length >= 100) return;
  const length = Math.min(size - state.offset, 4 * 1024 * 1024);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(cfg.rollout, 'r');
  let bytes;
  try { bytes = fs.readSync(fd, buffer, 0, length, state.offset); } finally { fs.closeSync(fd); }
  let start = 0;
  for (let i = 0; i < bytes; i++) {
    if (buffer[i] !== 10) continue;
    const end = i + 1;
    let row;
    if (!state.skipLine) { try { row = JSON.parse(buffer.subarray(start, i).toString('utf8')); } catch {} }
    state.skipLine = false;
    const item = row?.payload;
    if (row?.type === 'event_msg' && item?.type === 'task_started') state.activity = '正在处理';
    if (row?.type === 'event_msg' && ['task_complete', 'task_completed', 'turn_aborted'].includes(item?.type)) state.activity = '本轮已结束';
    if (row?.type === 'response_item' && item?.type === 'message' && item.role === 'assistant'
        && ['commentary', 'final'].includes(item.phase)) {
      const text = redact((item.content || []).filter((p) => p.type === 'output_text').map((p) => p.text || '').join('\n')).trim();
      if (text) {
        const id = item.id || hash(`${state.offset + start}:${text}`);
        const parts = chunks(text);
        const label = item.phase === 'final' ? '回复' : '进展';
        for (let n = 0; n < parts.length; n++) state.outbox.push({ id: `${id}:${n}`, text: `【Codex ${label}${parts.length > 1 ? ` ${n + 1}/${parts.length}` : ''}】\n${parts[n]}`, phase: item.phase, at: row.timestamp });
        state.lastVisibleAt = row.timestamp;
        state.activity = item.phase === 'final' ? '本轮已回复' : '正在处理';
      }
    }
    start = end;
    if (state.outbox.length >= 100) break;
  }
  state.offset += start;
  // Huge tool records are skipped without retaining their contents in memory or forwarding them.
  if (start === 0 && bytes === 4 * 1024 * 1024) { state.offset += bytes; state.skipLine = true; }
}

async function tick(force = false) {
  if (busy || !transport) return;
  busy = true;
  try {
    const cfg = config();
    const state = read('state.json', empty());
    if (!cfg || !state.enabled || !state.owner || !state.target || state.threadId !== cfg.threadId) return;
    collect(cfg, state);
    save(state); // Cursor and unsent replies commit together.
    if (!state.outbox.length || (!force && Date.now() - lastPush < 20000) || (!force && Date.now() < (state.retryAt || 0))) return;
    const first = state.outbox[0];
    let count = 1;
    let text = first.text;
    while (count < state.outbox.length && text.length + state.outbox[count].text.length < 3000) {
      text += `\n\n${state.outbox[count++].text}`;
    }
    lastPush = Date.now();
    try {
      await Promise.race([
        transport.sender.sendMarkdown(state.target, text),
        new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('RelaySendTimeout')), 20000); timer.unref(); }),
      ]);
      state.outbox.splice(0, count);
      state.sent += count;
      state.lastSentAt = new Date().toISOString();
      delete state.error;
      delete state.retryAt;
    } catch (error) {
      state.error = error?.name === 'AbortError' ? '发送超时' : 'QQ推送未成功，发送“取Codex回复”重试';
      state.retryAt = Date.now() + 120000;
      console.warn('[qq-codex-relay] push unavailable; replies retained locally');
    }
    save(state);
  } catch (error) { console.warn(`[qq-codex-relay] unavailable (${error?.code || error?.name || 'Error'})`); }
  finally { busy = false; }
}

export function registerQQRelay(ctx, sender, appId) {
  if (transport) throw new Error('QQ relay transport already registered');
  transport = { sender, appId: String(appId) };
  ctx.effect(() => {
    const timer = setInterval(() => { serial = serial.then(() => tick()).catch(() => {}); }, 2500);
    timer.unref();
    return () => { clearInterval(timer); transport = undefined; };
  }, 'qq-codex-relay.lifecycle');
}

export function enqueue(cfg, message) {
  return new Promise((resolve, reject) => {
    const child = spawn(cfg.codexPath, ['queue', '--thread', cfg.threadId, '--message', message], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_THREAD_ID: cfg.threadId },
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('QueueTimeout')); }, 20000);
    child.stdout.on('data', (data) => { output = (output + data.toString()).slice(-4096); });
    child.stderr.on('data', () => {}); // Never log QQ text or credential-bearing process output.
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const match = output.match(/Queued message ([0-9a-f-]{36}) for thread ([0-9a-f-]{36})/i);
      if (code === 0 && match?.[2] === cfg.threadId) resolve(match[1]);
      else reject(new Error('QueueNotConfirmed'));
    });
  });
}

async function handle({ identity, text = '', messageId = '' }) {
  const input = text.trim();
  const command = /^(?:(?:开启|关闭)Codex同步|Codex状态|取Codex回复|(?:转告|发给)Codex)/i.test(input);
  const cfg = config();
  if (!cfg) return command ? { handled: true, reply: '尚未配置 Codex 同步，请先在本机完成配对设置。' } : null;
  const state = read('state.json', empty());
  const owner = ownerKey(identity);
  if (identity.scope !== 'c2c') return command ? { handled: true, reply: 'Codex 同步仅支持已配对的私聊。' } : null;
  const pair = input.match(/^开启Codex同步(?:\s+([A-Z0-9-]+))?$/i);
  if (pair) {
    if (state.owner && state.owner !== owner) return { handled: true, reply: '此 Codex 聊天已绑定其他私聊。' };
    if (state.owner === owner && state.enabled) return { handled: true, reply: '当前私聊已经开启 Codex 同步。发送“转告Codex：你要说的话”即可传话。' };
    if (!state.owner) {
      const received = hash((pair[1] || '').toUpperCase());
      const expected = cfg.pairingHash || '';
      if (!Number.isFinite(cfg.pairingExpiresAt) || Date.now() > cfg.pairingExpiresAt || expected.length !== received.length
          || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return { handled: true, reply: '配对码无效或已过期，请在 Codex 获取新配对码。' };
    }
    state.owner = owner;
    state.target = { scope: 'c2c', targetId: identity.peerId, msgId: messageId };
    state.enabled = true;
    state.threadId = cfg.threadId;
    state.offset = endOfFile(cfg);
    state.outbox = [];
    state.skipLine = false;
    state.activity = '已开启，等待新进展';
    state.pairedAt ||= new Date().toISOString();
    save(state);
    return { handled: true, reply: '已开启当前 Codex 聊天的同步。\n转告Codex：你的消息\nCodex状态\n取Codex回复\n关闭Codex同步\n普通聊天仍由柚柚回答。只转发开启后的公开进展与回复。' };
  }
  if (state.owner !== owner) return command ? { handled: true, reply: '请先用本机提供的配对码开启私聊同步。' } : null;
  state.target = { scope: 'c2c', targetId: identity.peerId, msgId: messageId };
  save(state);
  if (/^关闭Codex同步$/i.test(input)) {
    state.enabled = false;
    state.outbox = [];
    save(state);
    return { handled: true, reply: '已关闭同步，待转发回复已清空。以后可发送“开启Codex同步”重新开启。' };
  }
  if (/^Codex状态$/i.test(input)) return { handled: true, reply: `Codex同步：${state.enabled ? '开启' : '关闭'}\n工作状态：${state.activity || '暂无新状态'}\n待转发：${state.outbox.length} 条\n已转发：${state.sent} 条\n最近入队：${state.lastQueuedAt || '无'}\n最近回复：${state.lastVisibleAt || '无'}${state.error ? `\n${state.error}` : ''}\n消息排队后需由本机 Codex 处理，关闭桌面版时不会生成回复。` };
  if (/^取Codex回复$/i.test(input)) {
    if (!state.enabled) return { handled: true, reply: '请先发送“开启Codex同步”。' };
    await tick(true);
    const latest = read('state.json', state);
    return { handled: true, reply: latest.outbox.length ? `仍有 ${latest.outbox.length} 条待发送。${latest.error || '正在依次发送，请稍候。'}` : '目前已无待转发回复。' };
  }
  const message = input.match(/^(?:转告|发给)Codex\s*[:：]\s*([\s\S]+)$/i);
  if (!message) return command ? { handled: true, reply: '用法：转告Codex：你要说的话' } : null;
  if (!state.enabled) return { handled: true, reply: '同步已关闭，请先发送“开启Codex同步”。' };
  if (message[1].length > 12000) return { handled: true, reply: '消息较长，请分成每条不超过 12000 字发送。' };
  if (!messageId) return { handled: true, reply: '未取得 QQ 消息编号，本次未转发，请重发。' };
  const id = hash(`${owner}:${messageId}`);
  if (state.incoming.some((item) => item.id === id)) return { handled: true, reply: '这条 QQ 消息已经处理过，请用“Codex状态”查看。' };
  state.incoming.push({ id, status: 'submitting' });
  state.incoming = state.incoming.slice(-200);
  save(state);
  try {
    const queuedId = await enqueue(cfg, `[来自已配对QQ私聊的用户消息，由柚柚转达]\n${message[1]}\n[回复和公开进展会自动转发到该用户QQ私聊。请正常处理此请求。]`);
    state.incoming.at(-1).status = 'queued';
    state.incoming.at(-1).queuedId = queuedId;
    state.lastQueuedAt = new Date().toISOString();
    save(state);
    return { handled: true, reply: `已通过本机 Codex 接口排队转达，等待处理。\n回执：${queuedId.slice(0, 8)}\n后续进展和回复会转到这里。` };
  } catch {
    state.incoming.at(-1).status = 'unconfirmed';
    save(state);
    return { handled: true, reply: '本次入队未确认成功，请先查看 Codex 是否收到，避免重复提交。QQ 普通聊天仍可使用。' };
  }
}

export function beforeCodexRelayTurn(input) {
  const next = serial.then(() => handle(input)).catch((error) => {
    console.warn(`[qq-codex-relay] command unavailable (${error?.code || error?.name || 'Error'})`);
    return /Codex/i.test(input.text || '') ? { handled: true, reply: 'Codex 同步暂不可用，普通聊天和长期记忆可继续使用。' } : null;
  });
  serial = next.then(() => {});
  return next;
}
