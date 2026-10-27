import { isClockControl } from './clock.js';
import { isTimetableControl } from './timetable.js';
import {observeTurn,directDeliveryCheck,noteDirectReply} from './turn-strategy.js';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { qqIdentity, memoryNamespace, actorLabel } from './identity.js';
import { groupCollectionAllowed } from './delivery-permission.js';
import { conversationMode } from './model-route.js';
import { privacyState, assertPrivacyContext } from './privacy.js';
import {groupReplyContext,limitGroupSend} from './group-activity.js';
import {validateGroupMentionText} from './group-mentions.js';

const trace = new AsyncLocalStorage();
const EVIDENCE = Symbol.for('qqbot.evidence');
const instrumented = new WeakSet();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
const receiptId = receipt => receipt?.message?.id || receipt?.id;
const enabled = () => !/^(?:false|0|off)$/i.test(process.env.QQBOT_EVIDENCE_ENABLED || 'true');
const isControl = text => isClockControl(text.replace(/<@!?[^>]+>/g,'').trim()) || isTimetableControl(text.replace(/<@!?[^>]+>/g,'').trim()) || /^(?:\/|认亲[:：\s]|绑定妈妈|设为妈妈|家庭身份|记住|忘记|删除记忆|查记忆|查看记忆|记忆列表|记忆状态|原文编号|最近原文|删除原文|确认删除|删除状态|重试删除|当前模型|模型状态|群聊节奏|群友频率|群里安静十分钟|群友模式|开启群友模式|关闭群友模式|开启陪伴|暂停主动消息|关闭主动消息|恢复主动消息|生图状态|开启生图|关闭生图)/.test(text.replace(/<@!?[^>]+>/g,'').trim());
let singleton;

export class EvidenceStore {
  #db;
  constructor(file, { recover = false } = {}) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.#db = new DatabaseSync(file);
    this.#db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const version = this.#db.prepare('PRAGMA user_version').get().user_version;
    if (![0,1,2,3,4].includes(version)) { this.#db.close(); throw Error('EvidenceSchemaUnsupported'); }
    this.#db.exec(fs.readFileSync(new URL('./evidence-schema.sql', import.meta.url), 'utf8'));
    if (recover) this.#transaction(() => {
      this.#db.prepare("INSERT INTO evidence_deliveries(event_id,state,at,error_class) SELECT id,'unknown',?,'ProcessInterrupted' FROM evidence_events WHERE state='prepared'").run(now());
      this.#db.exec("UPDATE evidence_events SET state='unknown' WHERE state='prepared'; UPDATE evidence_inbox SET status='interrupted' WHERE status='processing';");
    });
  }
  #transaction(action) {
    this.#db.exec('BEGIN IMMEDIATE');
    try { const value = action(); this.#db.exec('COMMIT'); return value; }
    catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }
  #insert({ id, identity, role, kind, state, text, raw, sourceTime = null, inboundIds = [], sessionId = null, platformId = null, eligible = false }) {
    const namespace = memoryNamespace(identity);
    const result = this.#db.prepare(`INSERT INTO evidence_events(id,namespace,app_id,scope,peer_id,actor_id,role,kind,state,text,raw_json,source_time,recorded_at,related_ids_json,session_id,platform_message_id,eligible)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, namespace, identity.appId, identity.scope, identity.peerId, identity.senderId,
      role, kind, state, text, JSON.stringify(raw), sourceTime === null ? null : String(sourceTime), now(), JSON.stringify(inboundIds), sessionId, platformId, eligible ? 1 : 0);
    return Number(result.lastInsertRowid);
  }
  #enqueue(event) {
    if (!event.eligible || !event.text.trim()) return;
    const cutoff = this.#db.prepare('SELECT through_seq FROM evidence_barriers WHERE namespace=?').get(event.namespace)?.through_seq || 0;
    if (event.seq <= cutoff) return;
    const privacy = privacyState({ appId: event.app_id, scope: event.scope, peerId: event.peer_id, senderId: event.actor_id });
    if (privacy.sources.has(event.id)) return;
    if (event.role === 'assistant') {
      if (event.state !== 'accepted') return;
      const sources = JSON.parse(event.related_ids_json);
      if (!sources.length) return;
      for (const id of sources) {
        const user = this.#db.prepare('SELECT namespace,seq,role FROM evidence_events WHERE id=?').get(id);
        if (!user || user.namespace !== event.namespace || user.role !== 'user' || user.seq <= cutoff || privacy.sources.has(id)) return;
      }
    }
    const length = Array.from(event.text).length;
    const statement = this.#db.prepare(`INSERT OR IGNORE INTO evidence_jobs(id,namespace,source_event_id,start_offset,end_offset,status,due,created_at,updated_at)
      VALUES(?,?,?,?,?,'pending',?,?,?)`);
    for (let start = 0; start < length; start += 6000) {
      const end = Math.min(length, start + 6000), stamp = now();
      statement.run(hash(['extract', event.id, start, end]), event.namespace, event.id, start, end, Date.now() / 1000 + 2, stamp, stamp);
    }
  }
  inbound(value, message, { eligible = true } = {}) {
    const identity = qqIdentity(value), namespace = memoryNamespace(identity);
    if (typeof message.messageId !== 'string' || !message.messageId) throw Error('EvidenceMessageIdRequired');
    const id = hash(['qq-inbound-v1', namespace, message.messageId]);
    const context = { id, identity, namespace, inboundIds: [id], kind: 'inbound', mode: 'chat', eligible, privacyVersion: privacyState(identity).version, control: !eligible };
    return this.#transaction(() => {
      const old = this.#db.prepare('SELECT actor_id FROM evidence_events WHERE id=?').get(id);
      if (old) {
        if (old.actor_id !== identity.senderId) throw Error('EvidenceActorConflict');
        return { ...context, duplicate: true };
      }
      this.#insert({ id, identity, role: 'user', kind: 'inbound', state: 'received', text: message.content || '', raw: message,
        sourceTime: message.timestamp ?? null, platformId: message.messageId, eligible });
      this.#db.prepare("INSERT INTO evidence_inbox(event_id,namespace,status,updated_at) VALUES(?,?,'received',?)").run(id, namespace, now());
      this.#enqueue(this.#db.prepare('SELECT * FROM evidence_events WHERE id=?').get(id));
      return { ...context, duplicate: false };
    });
  }
  inbox(context, status, sessionId = null) {
    for (const id of context?.inboundIds || []) {
      this.#db.prepare("UPDATE evidence_inbox SET status=?,session_id=COALESCE(?,session_id),updated_at=? WHERE event_id=? AND namespace=? AND status IN ('received','processing')").run(status, sessionId, now(), id, context.namespace);
      if (sessionId) this.#db.prepare('UPDATE evidence_events SET session_id=? WHERE id=? AND namespace=?').run(sessionId, id, context.namespace);
    }
  }
  draft(context, key, text, raw, kind = 'assistant_draft') {
    if (!context?.identity) return;
    assertPrivacyContext(context);
    const identity = qqIdentity(context.identity);
    const id = hash(['draft', context.namespace, context.sessionId || '', key || randomUUID()]);
    if (this.#db.prepare('SELECT id FROM evidence_events WHERE id=?').get(id)) return id;
    this.#insert({ id, identity, role: 'assistant', kind, state: 'draft', text, raw,
      inboundIds: context.inboundIds || [], sessionId: context.sessionId || null });
    return id;
  }
  prepare(context, target, text, payload, kind) {
    assertPrivacyContext(context);
    const identity = qqIdentity(context.identity);
    if (target.scope !== identity.scope || target.targetId !== identity.peerId) throw Error('EvidenceTargetMismatch');
    const id = randomUUID();
    this.#transaction(() => {
      this.#insert({ id, identity, role: 'assistant', kind, state: 'prepared', text, raw: payload,
        inboundIds: context.inboundIds || [], sessionId: context.sessionId || null,
        eligible: context.eligible !== false && ['agent', 'group'].includes(context.kind) });
      this.#db.prepare("INSERT INTO evidence_deliveries(event_id,state,at) VALUES(?,'prepared',?)").run(id, now());
    });
    return id;
  }
  settle(id, state, receipt = null, errorClass = null) {
    if (!['accepted', 'rejected', 'unknown'].includes(state)) throw Error('EvidenceDeliveryStateInvalid');
    const platformId = receiptId(receipt);
    if (state === 'accepted' && (typeof platformId !== 'string' || !platformId)) state = 'unknown';
    return this.#transaction(() => {
      const event = this.#db.prepare('SELECT * FROM evidence_events WHERE id=?').get(id);
      if (!event || event.state !== 'prepared') return;
      this.#db.prepare('UPDATE evidence_events SET state=?,platform_message_id=? WHERE id=?').run(state, state === 'accepted' ? platformId : null, id);
      this.#db.prepare('INSERT INTO evidence_deliveries(event_id,state,at,receipt_json,error_class) VALUES(?,?,?,?,?)').run(id, state, now(), receipt === null ? null : JSON.stringify(receipt), errorClass);
      if (state === 'accepted') this.#enqueue({ ...event, state });
    });
  }
  related(identity, messageId) {
    if (!messageId) return [];
    const row = this.#db.prepare("SELECT id FROM evidence_events WHERE namespace=? AND platform_message_id=? AND ((role='user' AND state='received') OR (role='assistant' AND state='accepted'))").get(memoryNamespace(identity), messageId);
    return row ? [row.id] : [];
  }
  sessionSources(identity, sessionId) {
    return this.#db.prepare("SELECT id FROM evidence_events WHERE namespace=? AND session_id=? AND role='user' AND state!='erased' ORDER BY seq").all(memoryNamespace(identity),sessionId).map(r => r.id);
  }
  platformIds(identity,ids){const ns=memoryNamespace(identity);return ids.flatMap(id=>{const row=this.#db.prepare('SELECT platform_message_id FROM evidence_events WHERE namespace=? AND id=?').get(ns,id);return row?.platform_message_id?[row.platform_message_id]:[];});}
  resolveUserSources(identity, ids) {
    const namespace=memoryNamespace(identity),seen=new Set(),users=[];
    const visit=id=>{
      if(seen.has(id))return;seen.add(id);
      const row=this.#db.prepare('SELECT role,related_ids_json FROM evidence_events WHERE namespace=? AND id=?').get(namespace,id);
      if(!row)return;
      if(row.role==='user')users.push(id);else for(const source of JSON.parse(row.related_ids_json))visit(source);
    };
    for(const id of ids)visit(id);
    return users;
  }
  close() { this.#db.close(); }
}

function store() {
  if (!singleton) singleton = new EvidenceStore(path.join(process.env.QQBOT_EVIDENCE_DIR || 'data/evidence', 'qq-evidence.sqlite3'), { recover: true });
  return singleton;
}
export function closeQQEvidence() { singleton?.close(); singleton = undefined; }
function permitted(identity) { return enabled() && conversationMode() === 'chat' && groupCollectionAllowed(identity); }
function currentContext(appId, target) {
  const current = trace.getStore();
  if (current?.skip) return null;
  if (current?.identity) {
    if (current.identity.scope !== target.scope || current.identity.peerId !== target.targetId) throw Error('EvidenceTargetMismatch');
    if (current.control) return { ...current, privacyVersion: privacyState(current.identity).version, eligible: false };
    assertPrivacyContext(current);
    return permitted(current.identity) ? current : null;
  }
  if (target.scope !== 'c2c') return null;
  const identity = qqIdentity({ appId: String(appId), scope: 'c2c', peerId: target.targetId });
  return permitted(identity) ? { identity, namespace: memoryNamespace(identity), inboundIds: [], kind: 'background', eligible: false, privacyVersion: privacyState(identity).version } : null;
}

export async function archiveQQInbound(ctx, next, appId) {
  const message = ctx.message;
  const identity = qqIdentity({ appId: String(appId), scope: message.kind, peerId: message.kind === 'group' ? message.groupOpenid : message.senderId, senderId: message.senderId });
  if (!permitted(identity)) return trace.run({ skip: true }, next);
  let context;
  try { context = store().inbound(identity, message, { eligible: !message.senderIsBot && !isControl(message.content || '') }); }
  catch { console.warn('[qq-evidence] incoming commit failed; Agent was not started'); throw Error('EvidenceIncomingUnavailable'); }
  ctx.state.qqEvidence = context;
  observeTurn(identity,message);
  if (context.duplicate) return;
  store().inbox(context, 'processing');
  if (privacyState(identity).pending && !/^(?:原文编号|最近原文|删除状态|重试删除|删除原文|确认删除|忘记|删除记忆)/.test((message.content || '').replace(/<@!?[^>]+>/g,'').trim())) {
    return trace.run(context,async()=>{
      await ctx.bot.sendMarkdown(ctx.replyTarget,'本会话的删除清理正在进行，暂不运行旧会话或工具。请稍后查看“删除状态”。');
      store().inbox(context,'privacy-held');
    });
  }
  return trace.run(context, async () => {
    try { const result = await next(); store().inbox(context, 'handled'); return result; }
    catch (error) { store().inbox(context, 'failed'); throw error; }
  });
}

export function bindQQEvidence(agent, context, sessionId, recalledSources = []) {
  const history = context ? store().sessionSources(context.identity,sessionId) : [];
  const deleted = context ? privacyState(context.identity).sources : new Set();
  const ids = context ? store().resolveUserSources(context.identity,[...history,...context.inboundIds,...recalledSources]).filter(id => !deleted.has(id)) : [];
  agent[EVIDENCE] = context ? { ...context, turnInboundIds: context.inboundIds, inboundIds: ids, kind: 'agent', sessionId } : { skip: true };
  if(context){const messages=store().platformIds(context.identity,context.inboundIds);agent[EVIDENCE].deliveryCheck=directDeliveryCheck(context.identity,messages.length?messages:[context.messageId].filter(Boolean));}
  if (context) store().inbox(context, 'processing', sessionId);
}
export function withQQEvidence(agent, callback) { return trace.run(agent?.[EVIDENCE] || { skip: true }, callback); }
export function withQQIdentity(identity, callback, { messageId, messageIds = [], sourceIds = [], kind = 'background', eligible = false, deliveryCheck = undefined } = {}) {
  identity = qqIdentity(identity);
  if (!permitted(identity)) return trace.run({ skip: true }, callback);
  if(!Array.isArray(sourceIds) || sourceIds.length>4096 || sourceIds.some(id=>typeof id!=='string'||id.length>128))throw Error('QQEvidenceSourcesInvalid');
  const privacy=privacyState(identity);
  if(privacy.pending)throw Error('QQPrivacyCleanupPending');
  if(!Array.isArray(messageIds)||messageIds.length>128||messageIds.some(id=>typeof id!=='string'))throw Error('QQEvidenceMessagesInvalid');
  const inboundIds=store().resolveUserSources(identity,[...[messageId,...messageIds].flatMap(id=>store().related(identity,id)),...sourceIds]).filter(id=>!privacy.sources.has(id));
  const context = { identity, namespace: memoryNamespace(identity), inboundIds, kind, eligible, mode: 'chat', privacyVersion: privacy.version,deliveryCheck };
  return trace.run(context, callback);
}
export function captureQQDraft(agent, event, sessionId) {
  const context = agent?.[EVIDENCE];
  if (!context?.identity || !permitted(context.identity)) return;
  try { assertPrivacyContext(context); } catch { return; }
  if (event.type === 'assistant/message') {
    const message = event.data?.message;
    const text = (message?.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('\n');
    if (text) store().draft({ ...context, sessionId }, event.id || event.seq || message.id, text, message);
  }
  if (event.type === 'turn/end') store().inbox(context, event.data?.reason?.kind === 'error' ? 'failed' : 'finished', sessionId);
}

async function dispatch(context, target, text, payload, kind, send) {
  if (!context) return send();
  const id = store().prepare(context, target, text, payload, kind);
  let receipt;
  try { receipt = await send(); }
  catch (error) {
    const status = error?.status ?? error?.statusCode;
    const state = status >= 400 && status < 500 && status !== 408 ? 'rejected' : 'unknown';
    try { store().settle(id, state, null, String(error?.code || error?.name || 'SendError').slice(0, 100)); }
    catch { console.warn('[qq-evidence] failed-send audit pending review'); }
    throw error;
  }
  try { store().settle(id, 'accepted', receipt); }
  catch { console.warn('[qq-evidence] send receipt not committed; result remains uncertain'); }
  if(receiptId(receipt)){try{noteDirectReply(context,text,receiptId(receipt));}catch{console.warn('[qq-turn] direct followup metadata unavailable');}}
  return receipt;
}

export function instrumentQQEvidence(bot, appId) {
  if (instrumented.has(bot)) return;
  instrumented.add(bot);
  for (const method of ['send', 'sendText', 'sendTextWithKeyboard', 'sendMarkdown', 'sendMedia']) {
    if (typeof bot[method] !== 'function') continue;
    const original = bot[method].bind(bot);
    bot[method] = (...args) => {
      const active = trace.getStore();
      if (active?.sending) return original(...args);
      const options = method === 'send' || method === 'sendMedia' ? args[0] : { target: args[0], content: args[1], ...(args[2] || {}) };
      const context = currentContext(appId, options.target);
      const payload = { ...options };
      if (payload.buffer) { payload.buffer = { bytes: payload.buffer.length, sha256: createHash('sha256').update(payload.buffer).digest('hex') }; }
      const text = typeof options.markdown?.content === 'string' ? options.markdown.content : typeof options.content === 'string' ? options.content : '';
      validateGroupMentionText(context?.identity||groupReplyContext(null,appId,options.target)?.identity,text);
      return limitGroupSend(groupReplyContext(context,appId,options.target),()=>dispatch(context, options.target, text, payload, method === 'sendMedia' ? 'media' : 'markdown',
        () => trace.run({ ...(context || active), sending: true }, () => original(...args))),()=>{assertPrivacyContext(context);context?.deliveryCheck?.();});
    };
  }
  if (typeof bot.openStream !== 'function') return;
  const originalStream = bot.openStream.bind(bot);
  bot.openStream = options => {
    const context = currentContext(appId, options.target), session = originalStream(options);
    const streamId = randomUUID(); let text = '', counter = 0, finished = false;
    return {
      update: async fullText => {
        text = fullText;
        if(context)store().draft(context, `${streamId}:${++counter}`, text, { streamId, text }, 'stream_snapshot');
        return session.update(fullText);
      },
      complete: async () => {
        if (finished) return session.complete();
        finished = true;
        return limitGroupSend(groupReplyContext(context,appId,options.target),()=>dispatch(context, options.target, text, { streamId, target: options.target, text }, 'stream', () => trace.run({...context,sending:true},()=>session.complete())),()=>{assertPrivacyContext(context);context?.deliveryCheck?.();});
      },
      cancel: () => { finished = true; return session.cancel?.(); },
    };
  };
}

export function mergeQQEvidence(contexts) {
  const first = contexts[0];
  if (contexts.length === 1) return first;
  const texts = contexts.filter(c => c.message.content).map(c => c.message.kind === 'group'
    ? `[${actorLabel(c.state.qqEvidence?.identity || { appId: process.env.QQBOT_APPID, scope: 'group', peerId: c.message.groupOpenid, senderId: c.message.senderId })}] ${c.message.content}` : c.message.content);
  first.message.content = texts.join('\n');
  first.message.attachments = contexts.flatMap(c => c.message.attachments || []);
  first.message.msgElements=contexts.flatMap(c=>c.message.msgElements||[]);
  const local=Symbol.for('qqbot.onebot.local-files');first.message[local]=contexts.flatMap(c=>c.message[local]||[]);
  if(!first.message.refMsgIdx)first.message.refMsgIdx=contexts.find(c=>c.message.refMsgIdx)?.message.refMsgIdx;
  if (first.state.qqEvidence) first.state.qqEvidence.inboundIds = [...new Set(contexts.flatMap(c => c.state.qqEvidence?.inboundIds || []))];
  if (first.state.qqEvidence) first.state.qqEvidence.groupDirected=contexts.some(c=>c.state.qqEvidence?.groupDirected);
  const envelopes = contexts.map(c => c.state.envelope).filter(Boolean);
  if (envelopes.length) first.state.envelope = envelopes.join('\n\n');
  return first;
}
