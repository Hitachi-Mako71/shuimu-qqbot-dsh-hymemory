import { qqIdentity, memoryNamespace } from './identity.js';
import { hasGroupController } from './group-control.js';
import { read, withPerson } from './companion-state.js';
import { groupCollectionAllowed } from './delivery-permission.js';
import { privacyState, assertPrivacyContext } from './privacy.js';
import { calculateClock, timeZone } from './clock-time.js';

const IDENTITY = Symbol.for('qqbot.identity');
const enabled = () => !/^(false|0|off)$/i.test(process.env.QQBOT_CLOCK_ENABLED || 'true');
const keys = new Set(['operation', 'time_zone', 'expression', 'target_time_zone', 'disambiguation']);

function trustedIdentity(value) {
  const identity = qqIdentity(value);
  if (privacyState(identity).pending) throw Error('ClockPrivacyPending');
  return identity;
}

function configured(identity) {
  if (identity.scope === 'group' && !groupCollectionAllowed(identity)) return null;
  const value = read(`people/${memoryNamespace(identity)}.json`, {}).clock;
  if (!value) return null;
  if (value.schema !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1
      || typeof value.confirmed_at !== 'string') throw Error('ClockSettingsInvalid');
  return value.time_zone === null ? null : { ...value, time_zone: timeZone(value.time_zone) };
}

function validateArguments(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !keys.has(k))) throw Error('ClockArgumentsInvalid');
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string' || value.length > (key === 'expression' ? 160 : 128)) throw Error('ClockArgumentsInvalid');
  }
}

export function readClock(identity, args = {}) {
  if (!enabled()) return { status: 'disabled', message: '时钟工具已关闭。' };
  validateArguments(args);
  const trusted = trustedIdentity(identity);
  // An explicit query zone never changes the confirmed conversation setting.
  const setting = args.time_zone ? null : configured(trusted);
  return { ...calculateClock({ ...args, time_zone: args.time_zone || setting?.time_zone }),
    timezone_source: args.time_zone ? 'explicit_query' : setting ? 'confirmed_setting' : 'unconfirmed',
    ...(setting ? { timezone_revision: setting.revision } : {}) };
}

async function changeZone(identity, value) {
  const trusted = trustedIdentity(identity), key = memoryNamespace(trusted);
  const zone = value === null ? null : timeZone(value);
  const expected = privacyState(trusted).version;
  return withPerson(key, (state, save) => {
    // Synchronous commit, rechecking after waiting for the per-person lock.
    const privacy = privacyState(trusted);
    if (privacy.pending || privacy.version !== expected) throw Error('ClockPrivacyPending');
    if (trusted.scope === 'group') {
      const room = read('groups/registry.json', { rooms: {} }).rooms?.[key];
      if (room?.enabled !== true || !hasGroupController(room, trusted.senderId)) throw Error('ClockGroupControllerRequired');
    }
    const revision = state.clock?.revision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw Error('ClockSettingsInvalid');
    state.clock = { schema: 1, time_zone: zone, revision: revision + 1, confirmed_at: new Date().toISOString() };
    save();
    return zone;
  });
}

function render(result) {
  if (result.status !== 'ok') {
    const candidates = result.candidates?.map((c, index) => `${index === 0 ? '较早' : '较晚'}：${c.local}（UTC ${c.utc}）`).join('\n');
    return [result.message, candidates].filter(Boolean).join('\n');
  }
  const show = value => `${value.local || value.date} ${value.weekday || ''}\n时区：${value.time_zone}${value.offset ? `（UTC${value.offset}）` : ''}`;
  let text = result.converted ? `原时间：${show(result.original)}\n换算后：${show(result.converted)}` : show(result);
  if (result.remaining_seconds !== undefined) {
    const seconds = Math.ceil(Math.abs(result.remaining_seconds));
    text += `\n${result.past ? '已经过去' : '还剩'}${Math.floor(seconds / 86400)}天${Math.floor(seconds % 86400 / 3600)}小时${Math.floor(seconds % 3600 / 60)}分${seconds % 60}秒。`;
  }
  return text + `\n采样时刻（UTC）：${result.sampled_at}`;
}

const nowCommand = /^(?:现在几点(?:了)?|现在(?:的)?时间|当前时间|今天(?:是)?(?:几号|几月几号|星期几|周几)|今天日期|明天(?:是)?(?:几号|星期几|周几)|后天(?:是)?(?:几号|星期几|周几)|UTC时间|北京时间)[?？。！!]*$/i;

export function isClockControl(input) {
  const text = input.trim();
  return nowCommand.test(text) || /^(?:时区状态|清除时区|设置时区)$/.test(text)
    || /^(?:设置时区|时间计算|倒计时|时区换算)\s*[:：]/.test(text);
}
// Only the gateway's current raw input can change a timezone. No model write tool.
export async function beforeClockTurn({ identity, text = '' }) {
  const input = text.trim();
  const set = input.match(/^设置时区\s*[:：]\s*(\S+)$/);
  const resolve = input.match(/^时间计算\s*[:：]\s*(.{1,160}?)(?:\s*\|\s*(较早|较晚))?$/s);
  const countdown = input.match(/^倒计时\s*[:：]\s*(.{1,160}?)(?:\s*\|\s*(较早|较晚))?$/s);
  const convert = input.match(/^时区换算\s*[:：]\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+?)(?:\s*\|\s*(较早|较晚))?$/);
  if (!isClockControl(input)) return null;
  if (!enabled()) return { handled: true, reply: '时钟功能已关闭。' };
  try {
    const trusted = trustedIdentity(identity);
    if (set || input === '清除时区') {
      const zone = await changeZone(trusted, set ? set[1] : null);
      return { handled: true, reply: zone ? `已将本会话时区设为 ${zone}。` : '已清除本会话时区，下次查询需要明确时区。' };
    }
    if (input === '设置时区') return { handled: true, reply: '请发送“设置时区：Asia/Shanghai”等 IANA 时区名称。群时区由已绑定管理者设置。' };
    if (input === '时区状态') {
      const setting = configured(trusted);
      return { handled: true, reply: setting ? `本会话时区：${setting.time_zone}\n确认时间（UTC）：${setting.confirmed_at}` : '本会话尚未确认时区。请发送“设置时区：Asia/Shanghai”等命令。' };
    }
    if (!convert && !resolve && !countdown && !nowCommand.test(input)) return { handled: true, reply: '请提供完整命令，例如“时间计算：明天18:00”“倒计时：2026-11-01 18:00”或“时区换算：明天18:00 | Asia/Shanghai | UTC”。' };
    const args = convert ? { operation: 'convert', expression: convert[1].trim(), time_zone: convert[2].trim(), target_time_zone: convert[3].trim() }
      : resolve ? { operation: 'resolve', expression: resolve[1] }
        : countdown ? { operation: 'countdown', expression: countdown[1] }
          : /^明天/.test(input) ? { operation: 'resolve', expression: '明天' }
            : /^后天/.test(input) ? { operation: 'resolve', expression: '后天' }
              : { operation: 'now', ...(/^UTC时间/i.test(input) ? { time_zone: 'UTC' } : /^北京时间/.test(input) ? { time_zone: 'Asia/Shanghai' } : {}) };
    const choice = convert?.[4] || resolve?.[2] || countdown?.[2];
    if (choice) args.disambiguation = choice === '较早' ? 'earlier' : 'later';
    return { handled: true, reply: render(readClock(trusted, args)) };
  } catch (error) {
    const message = error.message === 'ClockGroupControllerRequired' ? '群时区只能由已绑定的管理者修改。'
      : error.message === 'ClockPrivacyPending' ? '本会话正在清理删除请求，完成后再查询或设置时区。'
        : error instanceof RangeError || /Clock(TimeZone|Date|Offset)/.test(error.message) ? '时区或日期无效，请提供 IANA 时区及有效完整日期。'
          : '本次时间操作未确认成功，请稍后重试；不会根据旧时间猜测当前时刻。';
    return { handled: true, reply: message };
  }
}

export function installClock(ctx) {
  // Register the documented ToolDefinition directly; no new package dependency.
  ctx.get('tools').register({
    name: 'qqbot_clock',
    description: 'QQ按需真实时钟。仅在当前任务需要真实时间、星期、相对日期、时区换算或倒计时时使用。相对日期原词直接交给expression，不由模型先计算日期。默认使用用户在当前QQ会话确认的时区；未确认请澄清。明确指定的time_zone仅作用于本次查询。DST重复时刻先返回候选，仅在用户明确选定后传earlier/later。工具不创建提醒。',
    parameters: { type: 'object', additionalProperties: false, properties: {
      operation: { type: 'string', enum: ['now', 'resolve', 'convert', 'countdown'], description: '默认now。' },
      expression: { type: 'string', description: '用户原始时间表达式，例如明天18:00、下周一、两小时后、完整ISO日期时间。不得补造年份或时刻。' },
      time_zone: { type: 'string', description: '仅当本次用户明确指定时填写IANA时区，例如Asia/Shanghai；否则省略使用本会话设置。' },
      target_time_zone: { type: 'string', description: 'convert操作的目标IANA时区。' },
      disambiguation: { type: 'string', enum: ['earlier', 'later'], description: '用户明确选择夏令时重复时刻的较早或较晚一次后填写。' },
    } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!exec.agent?.[IDENTITY]) throw Error('QQIdentityRequired');
      if (exec.signal?.aborted) throw Error('ClockCancelled');
      assertPrivacyContext(exec.agent[Symbol.for('qqbot.evidence')]);
      return JSON.stringify(readClock(exec.agent[IDENTITY], args));
    },
  });
  ctx.get('systemPrompt').section({
    name: 'qqbot:clock-policy', order: 455, interpolate: false,
    text: ({ agent }) => agent?.[IDENTITY] ? '当前时刻需要时调用qqbot_clock；普通闲聊无需调用。工具结果只在sampled_at时有效，旧会话时间与旧工具结果不能冒充此刻；跨午夜或等待较久后重新采样。相对日期交给程序处理，缺时区、年份、上午下午或DST选择时按工具要求澄清。时区只通过本轮用户的“设置时区：IANA名称”命令修改，群设置仅绑定管理者可改。当前时间、倒计时和换算结果属于瞬时资料，不写入长期偏好，不据此声称已设提醒。' : '',
  });
}
