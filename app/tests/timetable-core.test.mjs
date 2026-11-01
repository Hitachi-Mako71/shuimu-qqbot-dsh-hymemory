import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv,parseTimetableCsv,parseWeeks,occurrencesOn,queryTimetable,timetableConflicts,timetablePreviewPage,timetableTemplate,dayEpoch } from '../dsh-hymemory-plugin/timetable-core.js';
import { fixtureRows,csv } from './timetable-fixtures.mjs';
const model=()=>parseTimetableCsv(csv(fixtureRows()));

test('editable UTF-8 BOM template parses but does not imply a real user timetable',()=>{
  const m=parseTimetableCsv(timetableTemplate());assert.equal(m.term.weeks,20);assert.match(m.courses[0].name,/示例/);assert.equal(m.periods.length,2);
});
test('CSV preserves quoted commas, escaped quotes, multiline Unicode and CRLF',()=>{
  const rows=fixtureRows();rows[4]['名称']='算法,"结构"🙂';rows[4]['备注']='第一行\n第二行';
  const m=parseTimetableCsv(csv(rows));assert.equal(m.courses[0].name,rows[4]['名称']);assert.equal(m.courses[0].note,rows[4]['备注']);
});
test('CSV rejects broken quoting, duplicated headers and oversized input',()=>{
  assert.throws(()=>parseCsv('"unterminated'),/闭合/);
  assert.throws(()=>parseCsv('a,a\n1,2'),/列名/);
  assert.throws(()=>parseCsv('x'.repeat(131073)),/128/);
});
test('dates, Monday anchor and explicit IANA timezone are validated',()=>{
  assert.throws(()=>dayEpoch('2026-02-30'),/不存在/);
  const r=fixtureRows();r[0]['日期']='2026-09-01';assert.throws(()=>parseTimetableCsv(csv(r)),/周一/);
  r[0]['日期']='2026-08-31';r[0]['时区']='';assert.throws(()=>parseTimetableCsv(csv(r)),/时区/);
});
test('irrelevant nonempty fields cannot silently change semantics',()=>{
  const r=fixtureRows();r[4]['日期']='2026-09-01';assert.throws(()=>parseTimetableCsv(csv(r)),/不适用/);
});
test('odd/even, unions and full-width parity notation select exact teaching weeks',()=>{
  assert.deepEqual(parseWeeks('1-6单',6),[1,3,5]);assert.deepEqual(parseWeeks('1-6（双）',6),[2,4,6]);
  assert.deepEqual(parseWeeks('1,3,5-6',6),[1,3,5,6]);assert.deepEqual(parseWeeks('双周',4),[2,4]);
  assert.throws(()=>parseWeeks('4-2',6));assert.throws(()=>parseWeeks('1-9',6));assert.throws(()=>parseWeeks('',6));
});
test('periods are ordered, nonoverlapping and every referenced section exists',()=>{
  const r=fixtureRows();r[2]['开始时间']='08:30';assert.throws(()=>parseTimetableCsv(csv(r)),/不重叠/);
  const s=fixtureRows();s[4]['结束节']='4';assert.throws(()=>parseTimetableCsv(csv(s)),/未定义/);
});
test('semester boundary excludes ordinary classes before and after the term',()=>{
  const m=model();assert.equal(occurrencesOn(m,'2026-08-24').length,0);assert.equal(occurrencesOn(m,'2026-08-31').length,1);
  assert.equal(occurrencesOn(m,'2026-09-21').length,1);assert.equal(occurrencesOn(m,'2026-09-28').length,0);
});
test('a holiday removes ordinary courses while explicit makeup overrides it',()=>{
  const r=fixtureRows();r.push({'类型':'假期','编号':'H1','日期':'2026-09-07','结束日期':'2026-09-09'});
  const m=parseTimetableCsv(csv(r));assert.equal(occurrencesOn(m,'2026-09-07').length,0);
  r.push({'类型':'补课','编号':'E1','日期':'2026-09-07','原课程编号':'C1','地点':'B202'});
  const a=occurrencesOn(parseTimetableCsv(csv(r)),'2026-09-07');assert.equal(a.length,1);assert.equal(a[0].kind,'补课');assert.equal(a[0].location,'B202');
});
test('cancellation affects only the specified occurrence',()=>{
  const r=fixtureRows();r.push({'类型':'停课','编号':'E1','原日期':'2026-09-07','原课程编号':'C1'});
  const m=parseTimetableCsv(csv(r));assert.equal(occurrencesOn(m,'2026-09-07').length,0);assert.equal(occurrencesOn(m,'2026-09-14').length,1);
});
test('reschedule cancels the original and can add a course outside the semester',()=>{
  const r=fixtureRows();r.push({'类型':'调课','编号':'E1','原日期':'2026-09-07','日期':'2026-10-03','原课程编号':'C1','开始节':'3','结束节':'3','地点':'NEW'});
  const m=parseTimetableCsv(csv(r));assert.equal(occurrencesOn(m,'2026-09-07').length,0);
  const a=occurrencesOn(m,'2026-10-03');assert.equal(a.length,1);assert.equal(a[0].start_time,'10:00');assert.equal(a[0].location,'NEW');
  const q=queryTimetable(m,{operation:'date',date:'2026-10-03'},Date.parse('2026-09-01T00:00:00Z'));assert.equal(q.teaching_week,null);
});
test('unknown references, duplicate overrides and wrong original weekday are rejected',()=>{
  const a=fixtureRows();a.push({'类型':'停课','编号':'E1','原日期':'2026-09-08','原课程编号':'C1'});assert.throws(()=>parseTimetableCsv(csv(a)),/真实发生/);
  a.at(-1)['原日期']='2026-09-07';a.push({...a.at(-1),'编号':'E2'});assert.throws(()=>parseTimetableCsv(csv(a)),/重复停课/);
  const b=fixtureRows();b.push({'类型':'补课','编号':'E1','原课程编号':'UNKNOWN','日期':'2026-10-01'});assert.throws(()=>parseTimetableCsv(csv(b)),/不存在/);
});
test('independent makeup has explicit name and periods without inferring a base class',()=>{
  const r=fixtureRows();r.push({'类型':'补课','编号':'E1','名称':'合成实验','日期':'2026-10-01','开始节':'3','结束节':'3'});
  const a=occurrencesOn(parseTimetableCsv(csv(r)),'2026-10-01');assert.equal(a[0].name,'合成实验');assert.equal(a[0].base_id,null);
});
test('conflicts remain visible without silently replacing either course',()=>{
  const r=fixtureRows();r.push({...r[4],'编号':'C2','名称':'冲突课程'});const a=occurrencesOn(parseTimetableCsv(csv(r)),'2026-08-31');
  assert.equal(a.length,2);assert.deepEqual(timetableConflicts(a),[['C1@2026-08-31','C2@2026-08-31']]);
});
test('today, explicit date and weekday rules use timetable timezone across UTC midnight',()=>{
  const m=model(),at=Date.parse('2026-08-30T16:01:00Z');
  const a=queryTimetable(m,{operation:'today'},at),b=queryTimetable(m,{operation:'date',date:'2026-08-31'},at);
  assert.deepEqual(a.items,b.items);assert.equal(a.range_start,'2026-08-31');assert.equal(a.teaching_week,1);assert.equal(a.attendance,'schedule_only_not_proof_of_attendance');
});
test('tomorrow crosses a month and current week begins on Monday',()=>{
  const m=model(),at=Date.parse('2026-08-31T03:00:00Z');
  assert.equal(queryTimetable(m,{operation:'tomorrow'},at).range_start,'2026-09-01');
  const w=queryTimetable(m,{operation:'week'},Date.parse('2026-09-06T03:00:00Z'));assert.equal(w.range_start,'2026-08-31');assert.equal(w.range_end,'2026-09-06');
});
test('next course skips a course already started and returns exact elapsed seconds',()=>{
  const m=model(),at=Date.parse('2026-08-31T00:30:00Z');
  const a=queryTimetable(m,{operation:'next'},at);assert.equal(a.items[0].date,'2026-09-07');assert.equal(a.items[0].remaining_seconds,7*86400-1800);
});
test('next course includes an out-of-term makeup without a fixed arbitrary search horizon',()=>{
  const r=fixtureRows();r.push({'类型':'补课','编号':'E1','原课程编号':'C1','日期':'2028-02-01'});
  const a=queryTimetable(parseTimetableCsv(csv(r)),{operation:'next'},Date.parse('2027-10-01T00:00:00Z'));assert.equal(a.items[0].date,'2028-02-01');
});
test('a current-time query samples once and does not sample again for each occurrence',t=>{
  let calls=0;t.mock.method(Date,'now',()=>{calls++;return Date.parse('2026-08-31T00:00:00Z');});
  const a=queryTimetable(model(),{operation:'today'});assert.equal(calls,1);assert.equal(a.sampled_at,'2026-08-31T00:00:00.000Z');
});
function dstRows(date,start,end,selection='') {
  const r=fixtureRows();r[0]['日期']=date;r[0]['时区']='America/New_York';r[0]['总周数']='1';
  r.splice(1,3,{'类型':'节次','编号':'1','开始时间':start,'结束时间':end});
  Object.assign(r[2],{'星期':'7','周次':'1','开始节':'1','结束节':'1','夏令时选择':selection});return r;
}
test('DST overlap does not guess an instant or countdown',()=>{
  const m=parseTimetableCsv(csv(dstRows('2026-10-26','01:30','01:45')));
  const q=queryTimetable(m,{operation:'next'},Date.parse('2026-11-01T04:00:00Z'));assert.equal(q.status,'clarification_required');assert.equal(q.items[0].time_status,'ambiguous_local_time');
});
test('explicit earlier and later DST choices resolve to distinct UTC instants',()=>{
  const a=queryTimetable(parseTimetableCsv(csv(dstRows('2026-10-26','01:30','01:45','较早'))),{operation:'date',date:'2026-11-01'},0);
  const b=queryTimetable(parseTimetableCsv(csv(dstRows('2026-10-26','01:30','01:45','较晚'))),{operation:'date',date:'2026-11-01'},0);
  assert.equal(a.items[0].start_utc,'2026-11-01T05:30:00.000Z');assert.equal(b.items[0].start_utc,'2026-11-01T06:30:00.000Z');
});
test('DST gap is reported as nonexistent without normalizing to a different class time',()=>{
  const m=parseTimetableCsv(csv(dstRows('2026-03-02','02:30','02:45')));
  const a=queryTimetable(m,{operation:'date',date:'2026-03-08'},0);assert.equal(a.items[0].time_status,'nonexistent_local_time');assert.equal(a.items[0].start_utc,undefined);
});
test('paginated preview retains every record and rejects pages outside the preview',()=>{
  const r=fixtureRows();for(let n=2;n<=11;n++)r.push({...r[4],'编号':'C'+n,'开始节':'3','结束节':'3'});
  const m=parseTimetableCsv(csv(r));const a=timetablePreviewPage(m,1),b=timetablePreviewPage(m,2);
  assert.equal(a.records.length,8);assert.equal(b.records.length,3);assert.equal(a.total_records,11);assert.equal(a.pages,2);assert.throws(()=>timetablePreviewPage(m,3));
});
test('a missing future class is described as absence from the confirmed source only',()=>{
  const a=queryTimetable(model(),{operation:'next'},Date.parse('2028-01-01T00:00:00Z'));assert.deepEqual(a.items,[]);assert.match(a.message,/已确认课表/);
});
