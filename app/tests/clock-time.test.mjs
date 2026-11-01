import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateClock, timeZone } from '../dsh-hymemory-plugin/clock-time.js';

function sample(t, at, args) {
  let calls = 0;
  t.mock.method(Date, 'now', () => { calls++; return Date.parse(at); });
  const result = calculateClock(args);
  assert.equal(calls, 1, 'one clock sample per calculation');
  assert.equal(result.sampled_at, at);
  return result;
}
const at = '2026-10-31T16:30:00.000Z';

test('UTC and Shanghai represent the same sampled instant across midnight', t => {
  const r = sample(t, at, { time_zone: 'Asia/Shanghai' });
  assert.equal(r.utc, at); assert.equal(r.local, '2026-11-01T00:30:00+08:00');
  assert.equal(r.offset_seconds, 28800); assert.equal(r.weekday, '星期日');
  assert.equal(r.source.clock, 'system-wall-clock'); assert.equal(r.source.tzdb, process.versions.tz);
});
test('unconfirmed timezone returns UTC without guessing a user location', t => {
  const r = sample(t, at, {}); assert.equal(r.status, 'timezone_required');
  assert.equal(r.utc, at); assert.equal(r.time_zone, undefined);
});
test('relative tomorrow advances the user local calendar, not UTC date', t => {
  const r = sample(t, at, { time_zone: 'Asia/Shanghai', operation: 'resolve', expression: '明天' });
  assert.equal(r.date, '2026-11-02'); assert.equal(r.weekday, '星期一'); assert.equal(r.precision, 'date');
});
test('tomorrow crosses a month boundary', t => {
  const r = sample(t, '2026-10-31T10:00:00.000Z', { time_zone: 'Asia/Shanghai', operation: 'resolve', expression: '明天18:00' });
  assert.equal(r.utc, '2026-11-01T10:00:00.000Z'); assert.equal(r.date, '2026-11-01');
});
test('tomorrow crosses a year boundary', t => {
  const r = sample(t, '2026-12-31T10:00:00.000Z', { time_zone: 'UTC', operation: 'resolve', expression: '明天' });
  assert.equal(r.date, '2027-01-01');
});
test('leap year February has a real February 29', t => {
  const r = sample(t, '2028-02-28T10:00:00.000Z', { time_zone: 'UTC', operation: 'resolve', expression: '明天' });
  assert.equal(r.date, '2028-02-29');
});
test('nonleap February goes directly to March', t => {
  const r = sample(t, '2027-02-28T10:00:00.000Z', { time_zone: 'UTC', operation: 'resolve', expression: '明天' });
  assert.equal(r.date, '2027-03-01');
});
test('next Monday uses the next ISO week, including when today is Sunday', t => {
  const r = sample(t, '2026-11-01T10:00:00.000Z', { time_zone: 'UTC', operation: 'resolve', expression: '下周一' });
  assert.equal(r.date, '2026-11-02');
});
test('relative weeks and Chinese numbers are calculated in calendar dates', t => {
  const r = sample(t, at, { time_zone: 'UTC', operation: 'resolve', expression: '两周后' });
  assert.equal(r.date, '2026-11-14');
});
test('Chinese afternoon half hour maps to a complete instant', t => {
  const r = sample(t, at, { time_zone: 'Asia/Shanghai', operation: 'resolve', expression: '明天下午三点半' });
  assert.equal(r.local, '2026-11-02T15:30:00+08:00');
});
test('unspecified AM/PM asks rather than selecting eight in the morning', t => {
  const r = sample(t, at, { time_zone: 'Asia/Shanghai', operation: 'resolve', expression: '明天八点' });
  assert.equal(r.status, 'clarification_required');
});
test('date alone remains a date, and cannot produce a countdown', t => {
  const r = sample(t, at, { time_zone: 'UTC', operation: 'countdown', expression: '明天' });
  assert.equal(r.status, 'clarification_required'); assert.equal(r.remaining_seconds, undefined);
});
test('missing year is not invented', t => {
  const r = sample(t, at, { time_zone: 'UTC', operation: 'resolve', expression: '11月2日18:00' });
  assert.equal(r.status, 'clarification_required');
});
test('month addition without a defined policy asks for clarification', t => {
  const r = sample(t, at, { time_zone: 'UTC', operation: 'resolve', expression: '下个月' });
  assert.equal(r.status, 'clarification_required');
});
test('invalid calendar dates and hours are rejected without normalization', () => {
  for (const expression of ['2026-02-30 12:00','2026-01-01 24:00','2026-01-01 10:60']) {
    assert.throws(() => calculateClock({ time_zone: 'UTC', operation: 'resolve', expression }), /ClockDateInvalid/);
  }
});
test('Windows names, numeric offsets and arbitrary strings are not IANA settings', () => {
  for (const zone of ['China Standard Time', '+08:00', '../../secret', 'NoSuch/Timezone']) assert.throws(() => timeZone(zone));
  assert.equal(timeZone('Asia/Shanghai'), 'Asia/Shanghai'); assert.equal(timeZone('UTC'), 'UTC');
});
test('NY spring DST gap does not normalize to a different time', t => {
  const r = sample(t, at, { time_zone: 'America/New_York', operation: 'resolve', expression: '2026-03-08 02:30' });
  assert.equal(r.reason, 'nonexistent_local_time'); assert.equal(r.status, 'clarification_required');
});
test('NY autumn DST overlap returns both distinct UTC candidates', t => {
  const r = sample(t, at, { time_zone: 'America/New_York', operation: 'resolve', expression: '2026-11-01 01:30' });
  assert.equal(r.reason, 'ambiguous_local_time');
  assert.deepEqual(r.candidates.map(c => c.utc), ['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z']);
});
test('explicit earlier selection converts the first repeated local time', t => {
  const r = sample(t, at, { time_zone: 'America/New_York', operation: 'convert', expression: '2026-11-01 01:30', target_time_zone: 'Asia/Shanghai', disambiguation: 'earlier' });
  assert.equal(r.original.offset, '-04:00'); assert.equal(r.converted.local, '2026-11-01T13:30:00+08:00');
});
test('explicit later selection converts the second repeated local time', t => {
  const r = sample(t, at, { time_zone: 'America/New_York', operation: 'convert', expression: '2026-11-01 01:30', target_time_zone: 'UTC', disambiguation: 'later' });
  assert.equal(r.original.offset, '-05:00'); assert.equal(r.converted.utc, '2026-11-01T06:30:00.000Z');
});
test('Lord Howe half-hour overlap is resolved using actual offsets', t => {
  const r = sample(t, at, { time_zone: 'Australia/Lord_Howe', operation: 'resolve', expression: '2026-04-05 01:45' });
  assert.equal(r.reason, 'ambiguous_local_time');
  assert.equal(Date.parse(r.candidates[1].utc) - Date.parse(r.candidates[0].utc), 1800000);
});
test('Lord Howe half-hour gap is rejected', t => {
  const r = sample(t, at, { time_zone: 'Australia/Lord_Howe', operation: 'resolve', expression: '2026-10-04 02:15' });
  assert.equal(r.reason, 'nonexistent_local_time');
});
test('a skipped date at the Samoa date-line transition is rejected', t => {
  const r = sample(t, at, { time_zone: 'Pacific/Apia', operation: 'resolve', expression: '2011-12-30 12:00' });
  assert.equal(r.reason, 'nonexistent_local_time');
});
test('elapsed two hours remains 7200 seconds across a spring DST jump', t => {
  const r = sample(t, '2026-03-08T06:30:00.000Z', { time_zone: 'America/New_York', operation: 'countdown', expression: '两小时后' });
  assert.equal(r.remaining_seconds, 7200); assert.equal(r.local, '2026-03-08T04:30:00-04:00');
});
test('calendar tomorrow can be only 23 elapsed hours away across DST', t => {
  const r = sample(t, '2026-03-07T17:00:00.000Z', { time_zone: 'America/New_York', operation: 'countdown', expression: '明天12:00' });
  assert.equal(r.remaining_seconds, 23 * 3600);
});
test('past countdown has a negative duration and an explicit past flag', t => {
  const r = sample(t, at, { time_zone: 'UTC', operation: 'countdown', expression: '一小时前' });
  assert.equal(r.remaining_seconds, -3600); assert.equal(r.past, true);
});
test('ISO offset denotes an instant independent of display timezone', t => {
  const r = sample(t, at, { time_zone: 'Asia/Shanghai', operation: 'resolve', expression: '2026-11-01T01:30-05:00' });
  assert.equal(r.utc, '2026-11-01T06:30:00.000Z'); assert.equal(r.local, '2026-11-01T14:30:00+08:00');
});
test('unsupported operation and DST choice are rejected', () => {
  assert.throws(() => calculateClock({ operation: 'set', time_zone: 'UTC' }), /ClockOperationInvalid/);
  assert.throws(() => calculateClock({ disambiguation: 'guess', time_zone: 'UTC' }), /ClockDisambiguationInvalid/);
});
