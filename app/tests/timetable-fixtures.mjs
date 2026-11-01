import { CSV_HEADERS } from '../dsh-hymemory-plugin/timetable-core.js';
export const fixtureRows=()=>[
  {'类型':'学期','编号':'TERM','名称':'合成学期','日期':'2026-08-31','总周数':'4','时区':'Asia/Shanghai'},
  {'类型':'节次','编号':'1','开始时间':'08:00','结束时间':'08:45'},
  {'类型':'节次','编号':'2','开始时间':'08:55','结束时间':'09:40'},
  {'类型':'节次','编号':'3','开始时间':'10:00','结束时间':'10:45'},
  {'类型':'课程','编号':'C1','名称':'合成数学','星期':'1','周次':'1-4','开始节':'1','结束节':'2','地点':'A101','教师':'合成老师'},
];
export const csv=rows=>'\uFEFF'+[CSV_HEADERS.join(','),...rows.map(r=>CSV_HEADERS.map(h=>String(r[h]??'')).map(v=>/[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v).join(','))].join('\r\n')+'\r\n';
