import fs from 'node:fs';
import path from 'node:path';
import { qqIdentity, memoryNamespace } from './identity.js';
import { groupHasController, hasGroupController } from './group-control.js';

function local(name) {
  const root = process.env.QQBOT_COMPANION_DIR || path.resolve('data/companion');
  return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''));
}

export function groupCollectionAllowed(identity) {
  try {
    const trusted = qqIdentity(identity);
    if (trusted.scope !== 'group') return true;
    const room = local('groups/registry.json').rooms?.[memoryNamespace(trusted)];
    return room?.enabled === true && groupHasController(room);
  } catch { return false; }
}

// This checks local authorization. Only a real platform receipt confirms delivery.
export function deliveryAllowed({ identity, target, purpose }) {
  try {
    const trusted = qqIdentity(identity), key = memoryNamespace(trusted);
    if (target?.scope !== trusted.scope || target.targetId !== trusted.peerId) return false;
    if (purpose === 'reply' || purpose === 'file') return true;
    if (trusted.scope === 'group') {
      const room = local('groups/registry.json').rooms?.[key];
      return room?.enabled === true && groupHasController(room) && Date.now() >= (room.snoozeUntil || 0)
        && (purpose === 'group' || (purpose === 'image' && hasGroupController(room, trusted.senderId)));
    }
    if (purpose === 'image') return true; // The image binding is checked by the image queue as well.
    if (purpose !== 'greeting') return false;
    const settings = local('settings.json');
    return settings.enabled === true && settings.owner === key && settings.target?.scope === 'c2c'
      && settings.target.targetId === trusted.peerId && Date.now() >= (settings.snoozeUntil || 0);
  } catch { return false; }
}
