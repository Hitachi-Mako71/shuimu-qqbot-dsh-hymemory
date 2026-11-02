import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { qqIdentity, memoryNamespace, actorLabel } from './identity.js';
import { groupCollectionAllowed } from './delivery-permission.js';
import { privacyState } from './privacy.js';
import { personaMaterialAllowed } from './persona-policy.js';

const clamp = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;
const empty = (reason, privacyVersion = 0) => ({
  messages: [], sourceIds: [], privacyVersion,
  coverage: { complete: false, reason },
});

function openEvidenceReadOnly() {
  const file = path.join(process.env.QQBOT_EVIDENCE_DIR || 'data/evidence', 'qq-evidence.sqlite3');
  // Opening a missing file with DatabaseSync would create a new database.
  if (!fs.existsSync(file)) return null;
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec('PRAGMA busy_timeout=5000;');
  if (db.prepare('PRAGMA user_version').get().user_version !== 4) {
    db.close();
    throw Error('ConversationHistorySchemaUnsupported');
  }
  return db;
}

function safePrivacy(identity) {
  const state = privacyState(identity);
  if (state.pending) return { ...state, blocked: true };
  return { ...state, blocked: false };
}

/**
 * Read bounded, eligible group evidence strictly before the current platform message.
 * The evidence database is never created or modified by this module.
 */
export function readGroupHistory(value, {
  beforePlatformMessageId,
  limit = 32,
  maxScanRows = 256,
  maxChars = 12000,
  afterReadForTest,
} = {}) {
  let identity;
  try { identity = qqIdentity(value); }
  catch { return empty('identity-rejected'); }
  if (identity.scope !== 'group') return empty('group-only');
  try { if (!groupCollectionAllowed(identity)) return empty('group-not-authorized'); }
  catch { return empty('group-not-authorized'); }
  if (typeof beforePlatformMessageId !== 'string' || !beforePlatformMessageId || beforePlatformMessageId.length > 256) {
    return empty('current-source-invalid');
  }

  let before;
  try { before = safePrivacy(identity); }
  catch { return empty('privacy-unavailable'); }
  if (before.blocked) return empty('privacy-pending', before.version);

  let db;
  try { db = openEvidenceReadOnly(); }
  catch { return empty('evidence-unavailable', before.version); }
  if (!db) return empty('evidence-unavailable', before.version);

  const namespace = memoryNamespace(identity);
  const messageLimit = clamp(limit, 32, 1, 128);
  const scanLimit = clamp(maxScanRows, 256, 1, 1024);
  const charLimit = clamp(maxChars, 12000, 1, 50000);
  let result;
  try {
    const current = db.prepare(`SELECT seq,id,actor_id,role,state FROM evidence_events
      WHERE namespace=? AND platform_message_id=? LIMIT 1`).get(namespace, beforePlatformMessageId);
    if (!current || current.role !== 'user' || current.state !== 'received' || current.actor_id !== identity.senderId || before.sources.has(current.id)) {
      result = empty('current-source-unavailable', before.version);
    } else {
      const barrier = db.prepare('SELECT through_seq FROM evidence_barriers WHERE namespace=?').get(namespace)?.through_seq || 0;
      const rows = db.prepare(`SELECT seq,id,role,actor_id,text,source_time,recorded_at,related_ids_json,state,eligible
        FROM evidence_events
        WHERE namespace=? AND seq<? AND seq>?
        ORDER BY seq DESC LIMIT ?`).all(namespace, current.seq, barrier, scanLimit + 1);
      const scanTruncated = rows.length > scanLimit;
      const selected = [];
      const selectedIds = new Set();
      let chars = 0;
      let excludedDeleted = false;
      for (const row of rows.slice(0, scanLimit)) {
        let related;
        try { related = JSON.parse(row.related_ids_json); }
        catch { continue; }
        if (row.state === 'erased' || before.sources.has(row.id) || related.some(id => before.sources.has(id))) {
          excludedDeleted = true;
          continue;
        }
        if (row.eligible !== 1 || !row.text || (row.role === 'user' && row.state !== 'received')
          || (row.role === 'assistant' && row.state !== 'accepted')
          || (row.role !== 'user' && row.role !== 'assistant') || !personaMaterialAllowed(row.text, row.seq)) continue;
        const text = Array.from(row.text).slice(0, charLimit - chars).join('');
        if (!text) break;
        const message = {
          sourceId: row.id,
          role: row.role,
          speaker: row.role === 'assistant' ? '柚柚' : actorLabel({ ...identity, senderId: row.actor_id }),
          time: row.source_time || row.recorded_at || null,
          text,
        };
        selected.unshift(message);
        selectedIds.add(row.id);
        chars += Array.from(text).length;
        if (text.length < row.text.length || selected.length >= messageLimit || chars >= charLimit) break;
      }
      result = {
        messages: selected,
        sourceIds: [...selectedIds],
        privacyVersion: before.version,
        coverage: {
          complete: false,
          reason: scanTruncated ? 'scan-limit' : barrier ? 'deletion-barrier' : excludedDeleted ? 'deleted-source' : 'bounded-recent-window',
          scanned: Math.min(rows.length, scanLimit),
          hasMore: scanTruncated,
        },
      };
    }
  } catch {
    result = empty('evidence-unavailable', before.version);
  } finally { db.close(); }

  // Test seam mutates only synthetic fixtures; production callers omit it.
  if (typeof afterReadForTest === 'function') {
    try { afterReadForTest(); } catch { return empty('evidence-unavailable', before.version); }
  }
  // A privacy change during the read invalidates the whole batch.
  try { if (!groupCollectionAllowed(identity)) return empty('group-not-authorized', before.version); }
  catch { return empty('group-not-authorized', before.version); }
  let after;
  try { after = safePrivacy(identity); }
  catch { return empty('privacy-unavailable'); }
  if (after.blocked) return empty('privacy-pending', after.version);
  if (after.version !== before.version || result.sourceIds.some(id => after.sources.has(id))) {
    return empty('privacy-changed', after.version);
  }
  return result;
}