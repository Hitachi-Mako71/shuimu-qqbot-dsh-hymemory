import fs from 'node:fs';
import path from 'node:path';
const directory = () => process.env.QQBOT_CODEX_IMAGES_DIR || path.resolve('data/codex-images');
export const imageDefaults = { enabled: false, auto: false, dailyMax: 6, minMinutes: 60, manualDailyMax: 20, timeoutMinutes: 30, characterEnabled: true };
export function imageSettings() {
  const file = path.join(directory(), 'images-settings.json');
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    value = {};
  }
  const result = { ...imageDefaults, ...value };
  for (const [key, low, high] of [['dailyMax', 1, 24], ['minMinutes', 20, 1440], ['manualDailyMax', 1, 100], ['timeoutMinutes', 5, 120]]) {
    if (!Number.isInteger(result[key]) || result[key] < low || result[key] > high) result[key] = imageDefaults[key];
  }
  for (const key of ['enabled', 'auto', 'characterEnabled']) if (typeof result[key] !== 'boolean') result[key] = imageDefaults[key];
  result.auto = false; // Virtual daily life and automatic illustrations were removed.
  return result;
}
export function saveImageSwitch(key, value) {
  const file = path.join(directory(), 'images-settings.json');
  const settings = imageSettings(); settings[key] = value;
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(settings), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}
