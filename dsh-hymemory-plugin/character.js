import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const profileFile = () => path.resolve(process.env.QQBOT_CODEX_RELAY_DIR || 'data/codex-relay', '../character/profile.json');
export function characterDescription() {
  try {
    const value = JSON.parse(fs.readFileSync(profileFile(), 'utf8').replace(/^\uFEFF/, ''));
    return value.schema === 1 && typeof value.description === 'string' ? value.description.slice(0, 3000) : '';
  } catch { return ''; }
}
export function characterReferences() {
  const file = profileFile();
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (value.schema !== 1 || !value.description || !Array.isArray(value.references) || value.references.length !== 3) throw new Error('CharacterProfileInvalid');
  const root = fs.realpathSync(path.dirname(file));
  const references = value.references.map((item) => {
    if (!['outfit', 'face', 'canonical'].includes(item.role) || !/^[a-z0-9-]+\.(?:png|jpe?g)$/i.test(item.file)) throw new Error('CharacterReferenceInvalid');
    const location = fs.realpathSync(path.join(root, item.file)), relative = path.relative(root, location);
    if (path.isAbsolute(relative) || relative.startsWith('..')) throw new Error('CharacterReferenceOutside');
    const info = fs.statSync(location);
    if (info.size < 1 || info.size > 30 * 1024 * 1024) throw new Error('CharacterReferenceSize');
    if (createHash('sha256').update(fs.readFileSync(location)).digest('hex') !== item.sha256) throw new Error('CharacterReferenceChanged');
    return { role: item.role, path: location, sha256: item.sha256 };
  });
  return { revision: value.revision, description: value.description.slice(0, 3000), references };
}
