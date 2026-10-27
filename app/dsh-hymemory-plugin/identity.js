import { createHash } from 'node:crypto';

const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);

// QQ gateway identifiers, never model arguments or DSH session IDs.
export function qqIdentity(value, expectedAppId = process.env.QQBOT_APPID) {
  if (!value || !validId(value.appId) || !validId(value.peerId) || !['c2c', 'group'].includes(value.scope)
      || (expectedAppId && value.appId !== String(expectedAppId))) throw new Error('QQIdentityRejected');
  const senderId = value.senderId ?? (value.scope === 'c2c' ? value.peerId : undefined);
  if (!validId(senderId) || (value.scope === 'c2c' && senderId !== value.peerId)) throw new Error('QQActorRejected');
  return Object.freeze({ appId: value.appId, scope: value.scope, peerId: value.peerId, senderId });
}

// Keep the original hash contract: existing memory partitions survive /new and upgrades.
export function memoryNamespace(value) {
  try {
    if (!value || !validId(value.appId) || !validId(value.peerId) || !['c2c', 'group'].includes(value.scope)) return '';
    return `qq-${createHash('sha256').update(JSON.stringify([value.appId, value.scope, value.peerId])).digest('hex')}`;
  } catch { return ''; }
}

export function actorLabel(identity) {
  const trusted = qqIdentity(identity);
  return '成员-' + createHash('sha256').update(JSON.stringify([trusted.appId, trusted.scope, trusted.peerId, trusted.senderId])).digest('hex').slice(0, 12);
}
