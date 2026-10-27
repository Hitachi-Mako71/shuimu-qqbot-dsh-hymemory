// Pure bounded time calculations: no files, network, model, cache, or timers.
const DAY = 86400000;
const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const pad = n => String(n).padStart(2, '0');

export function timeZone(value) {
  if (typeof value !== 'string' || value.length > 128
      || !(value === 'UTC' || /^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)+$/.test(value))) {
    throw Error('ClockTimeZoneInvalid');
  }
  return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
}

export function clockSource() {
  return { clock: 'system-wall-clock', database: 'Node.js Intl / ICU IANA tzdb',
    node: process.versions.node, icu: process.versions.icu || null, tzdb: process.versions.tz || null };
}

function civilEpoch(p) {
  const date = new Date(0);
  date.setUTCFullYear(p.year, p.month - 1, p.day);
  date.setUTCHours(p.hour || 0, p.minute || 0, p.second || 0, 0);
  return date.getTime();
}

function localParts(epoch, zone) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(epoch);
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}

function offsetSeconds(epoch, zone) {
  return (civilEpoch(localParts(epoch, zone)) - Math.floor(epoch / 1000) * 1000) / 1000;
}

function offsetText(seconds) {
  const n = Math.abs(seconds);
  return `${seconds < 0 ? '-' : '+'}${pad(Math.floor(n / 3600))}:${pad(Math.floor(n % 3600 / 60))}`
    + (n % 60 ? `:${pad(n % 60)}` : '');
}

const dateText = p => `${String(p.year).padStart(4, '0')}-${pad(p.month)}-${pad(p.day)}`;
const civilText = p => `${dateText(p)}T${pad(p.hour || 0)}:${pad(p.minute || 0)}:${pad(p.second || 0)}`;

function validCivil(p) {
  if (!Number.isInteger(p.year) || p.year < 1 || p.year > 9999 || p.month < 1 || p.month > 12
      || p.day < 1 || p.day > 31 || (p.hour || 0) > 23 || (p.minute || 0) > 59 || (p.second || 0) > 59) {
    throw Error('ClockDateInvalid');
  }
  const d = new Date(civilEpoch(p));
  if (d.getUTCFullYear() !== p.year || d.getUTCMonth() + 1 !== p.month || d.getUTCDate() !== p.day) {
    throw Error('ClockDateInvalid');
  }
  return p;
}

export function instant(epoch, zone) {
  if (!Number.isFinite(epoch) || !Number.isFinite(new Date(epoch).getTime())) throw Error('ClockDateInvalid');
  const p = localParts(epoch, zone), offset = offsetSeconds(epoch, zone);
  validCivil(p);
  return { utc: new Date(epoch).toISOString(), local: civilText(p) + offsetText(offset),
    date: dateText(p), weekday: weekdays[new Date(civilEpoch(p)).getUTCDay()],
    time_zone: zone, offset: offsetText(offset), offset_seconds: offset };
}

function civilCandidates(p, zone) {
  const naive = civilEpoch(validCivil(p));
  // Sample both sides of transitions, then round-trip every candidate.
  // Includes half-hour DST and date-line changes; never normalize gaps.
  const offsets = new Set();
  for (let hours = -48; hours <= 48; hours += 6) offsets.add(offsetSeconds(naive + hours * 3600000, zone));
  return [...offsets].map(offset => naive - offset * 1000)
    .filter(epoch => civilText(localParts(epoch, zone)) === civilText(p))
    .sort((a, b) => a - b);
}

// Pure civil-time resolution for deterministic timetable occurrences; no clock sample.
export function localTimeCandidates(date, time, zone) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw Error('ClockDateInvalid');
  return civilCandidates({ year: +d[1], month: +d[2], day: +d[3], hour: +t[1], minute: +t[2] }, timeZone(zone));
}

function cnNumber(text) {
  if (/^\d{1,5}$/.test(text)) return Number(text);
  const digits = '零一二三四五六七八九';
  if (text === '两') return 2;
  if (text.length === 1 && digits.includes(text)) return digits.indexOf(text);
  const match = text.match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  return match ? (match[1] ? digits.indexOf(match[1]) : 1) * 10 + (match[2] ? digits.indexOf(match[2]) : 0) : NaN;
}

function shiftDate(p, days) {
  // Civil dates advance independently of DST and the source time of day.
  const d = new Date(civilEpoch({ year: p.year, month: p.month, day: p.day }) + days * DAY);
  return validCivil({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

function parseExpression(expression, sampled, zone) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 160) return null;
  const text = expression.trim().replace(/\s+/g, ' ');
  if (/^(现在|此刻|now)$/i.test(text)) return { epoch: sampled };
  const absolute = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/i);
  if (absolute) {
    const [, y, m, d, h, min, sec, offset] = absolute;
    const p = validCivil({ year: +y, month: +m, day: +d, hour: +h, minute: +min, second: +(sec || 0) });
    const oh = offset.toUpperCase() === 'Z' ? 0 : Number(offset.slice(1, 3));
    const om = offset.toUpperCase() === 'Z' ? 0 : Number(offset.slice(4, 6));
    if (oh > 14 || om > 59 || (oh === 14 && om !== 0)) throw Error('ClockOffsetInvalid');
    return { epoch: civilEpoch(p) - (offset[0] === '-' ? -1 : 1) * (oh * 60 + om) * 60000 };
  }
  const duration = text.match(/^([\d零一二两三四五六七八九十]+)\s*(秒|分钟|小时)(后|前)$/);
  if (duration) {
    const n = cnNumber(duration[1]);
    if (!Number.isFinite(n) || n > 9999) return null;
    return { epoch: sampled + n * ({ 秒: 1000, 分钟: 60000, 小时: 3600000 }[duration[2]]) * (duration[3] === '前' ? -1 : 1) };
  }
  const match = text.match(/^(.*?)(?:[T ]?(\d{1,2}):(\d{2})(?::(\d{2}))?|\s*(凌晨|早上|上午|中午|下午|晚上)?\s*([\d零一二两三四五六七八九十]+)[点时](半|[\d零一二三四五六七八九十]+分?)?)?$/);
  if (!match) return null;
  const [, dayInput, hour, minute, second, period, cnHour, cnMinute] = match;
  const day = dayInput.trim();
  let p;
  const iso = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const relative = { 今天: 0, 今日: 0, 明天: 1, 后天: 2, 大后天: 3, 昨天: -1, 前天: -2 };
  const today = localParts(sampled, zone);
  if (iso) p = { year: +iso[1], month: +iso[2], day: +iso[3] };
  else if (Object.hasOwn(relative, day)) p = shiftDate(today, relative[day]);
  else {
    const days = day.match(/^([\d零一二两三四五六七八九十]+)(天|周)(后|前)$/);
    const week = day.match(/^(本|这|下|上)周([一二三四五六日天])$/);
    if (days) {
      const n = cnNumber(days[1]);
      if (!Number.isFinite(n) || n > 3660) return null;
      p = shiftDate(today, n * (days[2] === '周' ? 7 : 1) * (days[3] === '前' ? -1 : 1));
    } else if (week) {
      const weekday = new Date(civilEpoch(today)).getUTCDay() || 7;
      const target = '一二三四五六日'.indexOf(week[2] === '天' ? '日' : week[2]) + 1;
      p = shiftDate(today, target - weekday + ({ 本: 0, 这: 0, 下: 7, 上: -7 }[week[1]]));
    } else return null;
  }
  validCivil(p);
  if (hour === undefined && cnHour === undefined) return { date: p };
  let h = hour === undefined ? cnNumber(cnHour) : +hour;
  const min = minute === undefined ? (cnMinute === '半' ? 30 : cnMinute ? cnNumber(cnMinute.replace(/分$/, '')) : 0) : +minute;
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (period) {
    if (h < 1 || h > 12) return null;
    if (['下午', '晚上', '中午'].includes(period)) h = h % 12 + 12;
    else h %= 12;
  } else if (cnHour !== undefined && h >= 1 && h <= 12) return null;
  return { civil: validCivil({ ...p, hour: h, minute: min, second: +(second || 0) }) };
}

export function calculateClock({ operation = 'now', time_zone, expression, target_time_zone, disambiguation } = {}) {
  const sampled = Date.now();
  const base = { sampled_at: new Date(sampled).toISOString(), source: clockSource(), clock_contract: 1 };
  if (!['now', 'resolve', 'convert', 'countdown'].includes(operation)) throw Error('ClockOperationInvalid');
  if (disambiguation !== undefined && !['earlier', 'later'].includes(disambiguation)) throw Error('ClockDisambiguationInvalid');
  if (!time_zone) return { ...base, status: 'timezone_required', utc: base.sampled_at,
    message: '请明确本次查询的 IANA 时区，或发送“设置时区：Asia/Shanghai”等命令确认当前会话时区。' };
  const zone = timeZone(time_zone), now = instant(sampled, zone);
  if (operation === 'now') return { ...base, status: 'ok', ...now };
  const parsed = parseExpression(expression, sampled, zone);
  const clarify = message => ({ ...base, status: 'clarification_required', time_zone: zone, message });
  if (!parsed) return clarify('请补充完整日期与时刻，例如“明天18:00”或“2026-11-01 01:30”；中文几点请注明上午或下午。');
  if (parsed.date) {
    if (operation !== 'resolve') return clarify('请补充具体时刻，日期本身没有唯一的换算结果或倒计时。');
    return { ...base, status: 'ok', precision: 'date', date: dateText(parsed.date), time_zone: zone,
      weekday: weekdays[new Date(civilEpoch(parsed.date)).getUTCDay()] };
  }
  let epoch = parsed.epoch;
  if (parsed.civil) {
    const candidates = civilCandidates(parsed.civil, zone);
    if (!candidates.length) return { ...clarify('该本地时刻因时区规则跳变而不存在，请选择有效时刻。'), reason: 'nonexistent_local_time' };
    if (candidates.length > 1 && !disambiguation) return { ...clarify('该本地时刻重复出现，请明确采用较早或较晚的一次。'),
      reason: 'ambiguous_local_time', candidates: candidates.map(t => instant(t, zone)) };
    epoch = disambiguation === 'later' ? candidates.at(-1) : candidates[0];
  }
  const resolved = instant(epoch, zone);
  if (operation === 'convert') {
    if (!target_time_zone) return clarify('请补充目标 IANA 时区。');
    return { ...base, status: 'ok', precision: 'instant', original: resolved, converted: instant(epoch, timeZone(target_time_zone)) };
  }
  return { ...base, status: 'ok', precision: 'instant', ...resolved,
    ...(operation === 'countdown' ? { remaining_seconds: (epoch - sampled) / 1000, past: epoch < sampled } : {}) };
}
