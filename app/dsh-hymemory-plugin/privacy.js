import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { qqIdentity, memoryNamespace } from './identity.js';
import {personaSessionId,personaPolicy} from './persona-policy.js';

let seenAuthority = false;
export function privacyState(identity) {
  const namespace = memoryNamespace(qqIdentity(identity));
  const file = path.join(process.env.QQBOT_PRIVACY_DIR || '.privacy', 'lifecycle.sqlite3');
  if (!fs.existsSync(file)) {
    if (seenAuthority || process.env.QQBOT_PRIVACY_REQUIRED === 'true') throw Error('PrivacyAuthorityUnavailable');
    return { version: 0, pending: false, sources: new Set() };
  }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=5000');
    if (db.prepare('PRAGMA user_version').get().user_version !== 1) throw Error('PrivacySchemaUnsupported');
    seenAuthority = true;
    return {
      version: db.prepare('SELECT version FROM privacy_spaces WHERE namespace=?').get(namespace)?.version || 0,
      pending: Boolean(db.prepare("SELECT 1 FROM privacy_operations WHERE namespace=? AND status!='complete' LIMIT 1").get(namespace)),
      sources: new Set(db.prepare('SELECT source_id FROM privacy_sources WHERE namespace=?').all(namespace).map(r => r.source_id)),
    };
  } finally { db.close(); }
}
export function assertPrivacyContext(context) {
  if (!context?.identity) return;
  const state = privacyState(context.identity);
  if (state.version !== (context.privacyVersion || 0) || (context.inboundIds || []).some(id => state.sources.has(id))) throw Error('QQPrivacyContextExpired');
}
export function privacySessionId(key, identity, current) {
  current=personaSessionId(current);
  const version = privacyState(identity).version;
  if (!version) return current;
  const namespace=memoryNamespace(identity);
  const db=new DatabaseSync(path.join(process.env.QQBOT_EVIDENCE_DIR || 'data/evidence','qq-evidence.sqlite3'));
  try {
    db.exec('PRAGMA busy_timeout=5000');
    const existing=db.prepare('SELECT session_id FROM privacy_session_routes WHERE namespace=? AND version=? AND (source_session_id=? OR session_id=?) LIMIT 1').get(namespace,version,current,current);
    if(existing)return existing.session_id;
    const hash = createHash('sha256').update(JSON.stringify([key, 'privacy', version,current])).digest('hex');
    const result=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
    db.prepare('INSERT OR IGNORE INTO privacy_session_routes VALUES(?,?,?,?)').run(namespace,version,current,result);
    return result;
  } finally { db.close(); }
}
export async function retireQQPrivacySession(manager, identity) {
  const current = manager.getSessionRecord(identity.scope, identity.peerId);
  if (!current) return;
  const state = privacyState(identity);
  if ((current.agent?.[Symbol.for('qqbot.evidence')]?.privacyVersion || 0) === state.version
    && (current.agent?.[Symbol.for('qqbot.persona.revision')]||'')===(personaPolicy().revision||'')) return;
  const key = manager.sessionKey(identity.scope, identity.peerId);
  manager.sessions.delete(key);
  current.agent.cancel({ kind: 'user' });
  await current.handle.dispose();
  manager.questionChannel?.cancelPending(key);
  manager.approvalChannel?.cancelPending(key);
}
