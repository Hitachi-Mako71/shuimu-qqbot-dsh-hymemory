import { timeZone, instant, localTimeCandidates, clockSource } from './clock-time.js';

export const CSV_HEADERS = ['类型','编号','名称','日期','结束日期','总周数','时区','星期','周次','开始节','结束节','开始时间','结束时间','地点','教师','原日期','原课程编号','夏令时选择','备注'];
export const TIMETABLE_LIMITS = Object.freeze({ bytes: 131072, rows: 400, courses: 200, weeks: 53, periods: 24, query: 80 });
const DAY = 86400000;
const fail = (code, message, row) => { const e = Error(message); e.code = code; if (row) e.row = row; throw e; };
const text = (s, max = 120) => {
  if (typeof s !== 'string' || s.length > max || /[\0\x01-\x08\x0b\x0c\x0e-\x1f]/.test(s)) fail('field', '单元格过长或含无效控制字符。');
  return s.trim();
};
const integer = (s, lo, hi) => {
  if (!/^\d+$/.test(s) || +s < lo || +s > hi) fail('number', `请输入 ${lo} 至 ${hi} 的整数。`);
  return +s;
};
const identifier = s => { if (!/^[A-Za-z0-9_-]{1,48}$/.test(s)) fail('id','编号仅支持不超过48位的字母、数字、下划线和横线。'); return s; };
export function dayEpoch(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m || +m[1] < 1900 || +m[1] > 2199) fail('date','日期须为1900至2199年间有效的 YYYY-MM-DD。');
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(t).toISOString().slice(0,10) !== date) fail('date','日期不存在。');
  return t;
}
const shift = (date, n) => new Date(dayEpoch(date) + n * DAY).toISOString().slice(0,10);
const weekday = date => new Date(dayEpoch(date)).getUTCDay() || 7;
const minutes = value => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) fail('time','节次时间须为00:00至23:59的 HH:mm。');
  return +value.slice(0,2) * 60 + +value.slice(3);
};

export function parseCsv(input) {
  if (typeof input !== 'string' || Buffer.byteLength(input,'utf8') > TIMETABLE_LIMITS.bytes) fail('size','CSV须为UTF-8，且不超过128 KiB。');
  const s = input.replace(/^\uFEFF/,''), rows = [];
  let row = [], value = '', quoted = false, closed = false;
  const field = () => { if (value.length > 256) fail('field','CSV单元格不能超过256个字符。'); row.push(value); value=''; closed=false; };
  const record = () => { field(); if (row.some(v => v.trim())) rows.push(row); row=[]; if (rows.length > TIMETABLE_LIMITS.rows+1) fail('rows','CSV记录不能超过400行。'); };
  for (let i=0;i<s.length;i++) {
    const c=s[i];
    if (quoted) {
      if (c==='"') { if (s[i+1]==='"') {value+='"';i++;} else {quoted=false;closed=true;} }
      else value+=c;
    } else if (c===',') field();
    else if (c==='\r' || c==='\n') {record(); if(c==='\r' && s[i+1]==='\n') i++;}
    else if (closed) fail('csv','CSV引号后只能是逗号或换行。');
    else if (c==='"') {if(value) fail('csv','CSV字段中的引号必须成对转义。'); quoted=true;}
    else value+=c;
  }
  if (quoted) fail('csv','CSV引号没有闭合。');
  if (value || row.length || closed) record();
  if (!rows.length) fail('csv','CSV为空。');
  const headers=rows.shift();
  if (headers.length!==CSV_HEADERS.length || new Set(headers).size!==headers.length || CSV_HEADERS.some(h=>!headers.includes(h))) fail('headers','CSV列名须与课表模板一致，不可缺列、重复或新增列。');
  return rows.map((values,i)=>{
    if(values.length!==headers.length) fail('columns',`CSV第${i+2}行列数不符；含逗号的周次列表应放在双引号中。`,i+2);
    return {row:i+2,...Object.fromEntries(headers.map((h,j)=>[h,text(values[j],256)]))};
  });
}

export function parseWeeks(value, count) {
  let s=value.replace(/\s+/g,'').replace(/（/g,'(').replace(/）/g,')');
  const parity=/(?:\(?([单双])周?\)?)$/.exec(s);
  if(parity) s=s.slice(0,parity.index);
  if(!s && parity) s=`1-${count}`;
  if(!s) fail('weeks','课程必须明确周次，例如1-16、1-16单或1,3,5。');
  const values=new Set();
  for(const part of s.split(/[,，]/)) {
    const m=/^(\d+)(?:-(\d+))?$/.exec(part);
    if(!m) fail('weeks','周次格式无效。');
    const from=integer(m[1],1,count),to=integer(m[2]||m[1],1,count);
    if(from>to) fail('weeks','周次范围不能倒置。');
    for(let n=from;n<=to;n++) if(!parity || n%2===(parity[1]==='单'?1:0)) values.add(n);
  }
  if(!values.size) fail('weeks','周次筛选后没有任何教学周。');
  return [...values].sort((a,b)=>a-b);
}

const allowed = {
  学期:['日期','总周数','时区'], 节次:['开始时间','结束时间'],
  课程:['星期','周次','开始节','结束节','地点','教师','夏令时选择'],
  停课:['原日期','原课程编号'], 补课:['日期','原课程编号','开始节','结束节','地点','教师','夏令时选择'],
  调课:['日期','原日期','原课程编号','开始节','结束节','地点','教师','夏令时选择'], 假期:['日期','结束日期'],
};
function periodRange(r, periods, base) {
  const from=r['开始节']?integer(r['开始节'],1,24):base?.period_from;
  const to=r['结束节']?integer(r['结束节'],1,24):base?.period_to;
  if(!from || !to || to<from || (Boolean(r['开始节'])!==Boolean(r['结束节']))) fail('period','课程开始节、结束节须成对填写且顺序正确。');
  for(let n=from;n<=to;n++) if(!periods.some(p=>p.number===n)) fail('period','课程引用了未定义的节次。');
  return {period_from:from,period_to:to};
}
function choice(value, fallback) {
  if(!value) return fallback || null;
  if(!['较早','较晚'].includes(value)) fail('dst','夏令时选择只能为空、较早或较晚。');
  return value==='较早'?'earlier':'later';
}
function isBaseDate(model,course,date) {
  const n=(dayEpoch(date)-dayEpoch(model.term.start_date))/DAY;
  return n>=0 && n<model.term.weeks*7 && weekday(date)===course.weekday && course.weeks.includes(Math.floor(n/7)+1);
}
export function parseTimetableCsv(input) {
  const rows=parseCsv(input);
  for(const r of rows) {
    if(!allowed[r['类型']]) fail('type',`第${r.row}行类型须为学期、节次、课程、停课、补课、调课或假期。`,r.row);
    const permitted=new Set(['类型','编号','名称','备注',...allowed[r['类型']]]);
    for(const h of CSV_HEADERS) if(r[h] && !permitted.has(h)) fail('unused',`第${r.row}行的“${h}”不适用于${r['类型']}。`,r.row);
    identifier(r['编号']); text(r['名称']); text(r['备注']);
  }
  const terms=rows.filter(r=>r['类型']==='学期');
  if(terms.length!==1) fail('term','文件必须且只能有一行学期。');
  const t=terms[0]; dayEpoch(t['日期']);
  if(weekday(t['日期'])!==1) fail('term','学期日期须填写教学第1周的周一。');
  let zone; try {zone=timeZone(t['时区']);} catch {fail('zone','学期须明确有效的IANA时区。');}
  const model={schema:1,term:{id:t['编号'],name:t['名称']||t['编号'],start_date:t['日期'],weeks:integer(t['总周数'],1,53),time_zone:zone},periods:[],courses:[],exceptions:[],holidays:[]};
  dayEpoch(shift(model.term.start_date,model.term.weeks*7-1));
  const periods=rows.filter(r=>r['类型']==='节次');
  if(!periods.length || periods.length>24) fail('period','须定义1至24个节次。');
  for(const r of periods) model.periods.push({number:integer(r['编号'],1,24),start:r['开始时间'],end:r['结束时间']});
  model.periods.sort((a,b)=>a.number-b.number);
  const seen=new Set(); let last=-1;
  for(const p of model.periods) {
    const a=minutes(p.start),b=minutes(p.end);
    if(seen.has(p.number) || a<last || b<=a) fail('period','节次编号不可重复，时段须按节号递增且不重叠；不支持跨午夜节次。');
    seen.add(p.number);last=b;
  }
  const ids=new Set();
  for(const r of rows.filter(r=>r['类型']==='课程')) {
    if(ids.has(r['编号']) || !r['名称']) fail('course','课程编号必须唯一，名称不能为空。');
    ids.add(r['编号']);
    const day={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7}[r['星期']]||integer(r['星期'],1,7);
    model.courses.push({id:r['编号'],name:r['名称'],weekday:day,weeks:parseWeeks(r['周次'],model.term.weeks),
      ...periodRange(r,model.periods),location:text(r['地点']),teacher:text(r['教师']),disambiguation:choice(r['夏令时选择']),note:r['备注']});
  }
  if(model.courses.length>200) fail('courses','常规课程不能超过200条。');
  const exceptionIds=new Set(), canceled=new Set();
  for(const r of rows.filter(r=>['停课','补课','调课','假期'].includes(r['类型']))) {
    if(exceptionIds.has(r['编号'])) fail('exception','例外编号不可重复。');
    exceptionIds.add(r['编号']);
    if(r['类型']==='假期') {
      dayEpoch(r['日期']); const end=r['结束日期']||r['日期'];dayEpoch(end);
      if(end<r['日期'] || dayEpoch(end)-dayEpoch(r['日期'])>366*DAY) fail('holiday','假期范围倒置或超过366天。');
      model.holidays.push({id:r['编号'],name:r['名称']||'假期',from:r['日期'],to:end});continue;
    }
    const base=model.courses.find(c=>c.id===r['原课程编号']);
    if(r['原课程编号'] && !base) fail('reference','例外引用了不存在的原课程编号。');
    if(['停课','调课'].includes(r['类型'])) {
      if(!base || !isBaseDate(model,base,r['原日期'])) fail('reference','停课/调课须对应原课程的真实发生日期。');
      const key=base.id+'@'+r['原日期'];
      if(canceled.has(key)) fail('exception','同一原课程日期不能重复停课或调课。');
      canceled.add(key);
    }
    const e={id:r['编号'],type:r['类型'],base_id:base?.id||null,original_date:r['原日期']||null,note:r['备注']};
    if(e.type!=='停课') {
      dayEpoch(r['日期']);
      if(!r['名称'] && !base) fail('course','独立补课必须填写名称。');
      Object.assign(e,{date:r['日期'],name:r['名称']||base.name,...periodRange(r,model.periods,base),
        location:r['地点']||base?.location||'',teacher:r['教师']||base?.teacher||'',disambiguation:choice(r['夏令时选择'],base?.disambiguation)});
    }
    model.exceptions.push(e);
  }
  if(!model.courses.length && !model.exceptions.some(e=>e.type!=='停课')) fail('course','至少需要一条课程或补课。');
  return model;
}

export function occurrencesOn(model,date) {
  dayEpoch(date);
  const holiday=model.holidays.some(h=>date>=h.from && date<=h.to);
  const result=[];
  for(const c of model.courses) {
    if(!holiday && isBaseDate(model,c,date) && !model.exceptions.some(e=>e.base_id===c.id && e.original_date===date && ['停课','调课'].includes(e.type))) result.push({...c,date,occurrence_id:c.id+'@'+date,kind:'regular'});
  }
  for(const e of model.exceptions) if(e.type!=='停课' && e.date===date) result.push({...e,id:e.base_id||e.id,date,occurrence_id:e.id+'@'+date,kind:e.type});
  for(const c of result) {
    c.start_time=model.periods.find(p=>p.number===c.period_from).start;
    c.end_time=model.periods.find(p=>p.number===c.period_to).end;
  }
  return result.sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.occurrence_id.localeCompare(b.occurrence_id));
}
export function timetableConflicts(items) {
  const result=[];
  for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++) {
    if(items[i].date===items[j].date && items[i].start_time<items[j].end_time && items[j].start_time<items[i].end_time) result.push([items[i].occurrence_id,items[j].occurrence_id]);
  }
  return result;
}
function timed(model,item) {
  const starts=localTimeCandidates(item.date,item.start_time,model.term.time_zone);
  const ends=localTimeCandidates(item.date,item.end_time,model.term.time_zone);
  const ambiguous=starts.length>1 || ends.length>1;
  if(!starts.length || !ends.length || (ambiguous && !item.disambiguation)) return {...item,time_status:!starts.length||!ends.length?'nonexistent_local_time':'ambiguous_local_time',
    start_candidates:starts.map(t=>new Date(t).toISOString()),end_candidates:ends.map(t=>new Date(t).toISOString())};
  const start=item.disambiguation==='later'?starts.at(-1):starts[0],end=item.disambiguation==='later'?ends.at(-1):ends[0];
  if(end<=start) return {...item,time_status:'invalid_interval'};
  return {...item,time_status:'ok',start_utc:new Date(start).toISOString(),end_utc:new Date(end).toISOString()};
}
export function queryTimetable(model,{operation='today',date}={},sampled=Date.now()) {
  const zone=model.term.time_zone,now=instant(sampled,zone),base={sampled_at:new Date(sampled).toISOString(),time_zone:zone,source:clockSource(),attendance:'schedule_only_not_proof_of_attendance'};
  if(!['today','tomorrow','date','week','next'].includes(operation)) fail('operation','不支持的课表查询。');
  if(operation==='next') {
    const dates=new Set();
    for(const c of model.courses) for(const week of c.weeks) dates.add(shift(model.term.start_date,(week-1)*7+c.weekday-1));
    for(const e of model.exceptions) if(e.type!=='停课') dates.add(e.date);
    for(const d of [...dates].sort().filter(d=>d>=now.date)) {
      const items=occurrencesOn(model,d).map(c=>timed(model,c));
      const uncertain=items.filter(c=>c.time_status!=='ok' && (!(c.start_candidates||[]).length || c.start_candidates.some(t=>Date.parse(t)>sampled)));
      const future=items.filter(c=>c.time_status==='ok' && Date.parse(c.start_utc)>sampled).sort((a,b)=>a.start_utc.localeCompare(b.start_utc));
      if(uncertain.length) return {...base,status:'clarification_required',reason:'timetable_dst',items:uncertain, message:'下一节查询遇到时区跳变或重复时刻，请在CSV中明确较早/较晚或修正无效时段。'};
      if(future.length) return {...base,status:'ok',items:[{...future[0],remaining_seconds:(Date.parse(future[0].start_utc)-sampled)/1000}],conflicts:timetableConflicts(items).slice(0,30)};
    }
    return {...base,status:'ok',items:[],message:'已确认课表中没有尚未开始的下一节；不推测未导入课程。'};
  }
  let start=operation==='tomorrow'?shift(now.date,1):operation==='date'?date:now.date;
  dayEpoch(start);
  const length=operation==='week'?7:1;
  if(operation==='week') start=shift(now.date,1-weekday(now.date));
  const all=[];for(let n=0;n<length;n++) all.push(...occurrencesOn(model,shift(start,n)).map(c=>timed(model,c)));
  const items=all.slice(0,TIMETABLE_LIMITS.query);
  const week=Math.floor((dayEpoch(start)-dayEpoch(model.term.start_date))/DAY/7)+1;
  const conflicts=timetableConflicts(all);
  return {...base,status:'ok',range_start:start,range_end:shift(start,length-1),teaching_week:week>=1&&week<=model.term.weeks?week:null,
    items,conflicts:conflicts.slice(0,30),conflict_count:conflicts.length,truncated:all.length>items.length,total:all.length};
}

export function previewTimetable(model) {
  const warnings=[];
  const days=new Set();
  for(const c of model.courses) for(const w of c.weeks) days.add(shift(model.term.start_date,(w-1)*7+c.weekday-1));
  for(const e of model.exceptions) if(e.type!=='停课') days.add(e.date);
  for(const date of [...days].sort()) {
    const conflicts=timetableConflicts(occurrencesOn(model,date));
    if(conflicts.length) warnings.push({date,conflicts:conflicts.slice(0,5)});
    if(warnings.length>=5) break;
  }
  return {term:model.term,periods:model.periods,courses:model.courses,exceptions:model.exceptions,holidays:model.holidays,conflict_examples:warnings,
    counts:{courses:model.courses.length,exceptions:model.exceptions.length,holidays:model.holidays.length}};
}

export function timetablePreviewPage(model,page=1) {
  const all=[...model.courses.map(c=>({kind:'课程',...c})),...model.exceptions,...model.holidays.map(h=>({kind:'假期',...h}))];
  const pages=Math.max(1,Math.ceil(all.length/8));
  if(!Number.isInteger(page) || page<1 || page>pages) fail('page',`预览页码应为1至${pages}。`);
  const full=previewTimetable(model);
  return {term:full.term,periods:full.periods,counts:full.counts,conflict_examples:full.conflict_examples,
    records:all.slice((page-1)*8,page*8),page,pages,total_records:all.length};
}

export function timetableTemplate() {
  const row=(type,values)=>CSV_HEADERS.map(h=>String(h==='类型'?type:values[h]||'')).map(v=>/[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v).join(',');
  return '\uFEFF'+[CSV_HEADERS.join(','),
    row('学期',{'编号':'TERM','名称':'示例学期请修改','日期':'2026-08-31','总周数':'20','时区':'Asia/Shanghai'}),
    row('节次',{'编号':'1','开始时间':'08:00','结束时间':'08:45'}),
    row('节次',{'编号':'2','开始时间':'08:55','结束时间':'09:40'}),
    row('课程',{'编号':'C001','名称':'示例课程请修改','星期':'1','周次':'1-16','开始节':'1','结束节':'2','地点':'示例教室','教师':'示例教师'})].join('\r\n')+'\r\n';
}
