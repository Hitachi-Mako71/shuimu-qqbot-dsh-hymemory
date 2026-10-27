import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { qqIdentity, memoryNamespace } from './identity.js';
import { privacyState } from './privacy.js';
import { qqWorkspace, scopedPath } from './workspace.js';
import { parseTimetableCsv, timetablePreviewPage, queryTimetable, TIMETABLE_LIMITS } from './timetable-core.js';

const queues=new Map();
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
export const timetableEnabled=()=>!/^(false|0|off)$/i.test(process.env.QQBOT_TIMETABLE_ENABLED||'true');
const directory=()=>path.resolve(process.env.QQBOT_EVIDENCE_DIR||'data/evidence','../timetables');
const authorityFile=()=>path.join(process.env.QQBOT_PRIVACY_DIR||'.privacy','lifecycle.sqlite3');
function identityOf(value) {
  const i=qqIdentity(value);
  if(i.scope!=='c2c') fail('private_only','课表只在当前私聊使用，群聊不能读取或修改私人课表。');
  if(!timetableEnabled()) fail('disabled','课表功能已关闭。');
  return i;
}
function withinAuthority(identity,expected,action) {
  const initial=privacyState(identity);
  if(initial.pending || (expected!==undefined && initial.version!==expected)) fail('privacy','删除版本已改变或正在清理，请结束后重新预览。');
  const file=authorityFile();
  if(!fs.existsSync(file)) return action({...initial,eraseVersion:0});
  const db=new DatabaseSync(file);
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
    const key=memoryNamespace(identity);
    if(db.prepare('PRAGMA user_version').get().user_version!==1) fail('privacy','删除权威版本不受支持。');
    const version=db.prepare('SELECT version FROM privacy_spaces WHERE namespace=?').get(key)?.version||0;
    const pending=db.prepare("SELECT 1 FROM privacy_operations WHERE namespace=? AND status!='complete' LIMIT 1").get(key);
    if(pending || version!==initial.version) fail('privacy','删除版本已改变或正在清理，请结束后重新预览。');
    const columns=db.prepare('PRAGMA table_info(privacy_operations)').all().map(c=>c.name);
    if(!columns.includes('mode') || !columns.includes('version')) fail('privacy','删除权威缺少物理删除版本字段，课表操作已阻断。');
    const eraseVersion=db.prepare("SELECT MAX(version) v FROM privacy_operations WHERE namespace=? AND mode='erase'").get(key)?.v||0;
    const result=action({version,pending:false,eraseVersion});
    db.exec('COMMIT');return result;
  } catch(error) {try{db.exec('ROLLBACK');}catch{}throw error;}
  finally {db.close();}
}
function safeFile(identity,create=false) {
  const root=directory();
  if(create) fs.mkdirSync(root,{recursive:true,mode:0o700});
  if(fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) fail('path','课表目录不能是链接。');
  const file=path.join(root,memoryNamespace(identity)+'.json');
  if(fs.existsSync(file) && (fs.lstatSync(file).isSymbolicLink() || !fs.lstatSync(file).isFile())) fail('path','课表文件必须是普通文件。');
  return file;
}
function load(identity,privacy) {
  const file=safeFile(identity);
  if(!fs.existsSync(file)) return {schema:1,revision:0,privacy_version:privacy.version,active:null,previous:null,pending:null};
  if(fs.statSync(file).size>2*1024*1024) fail('state','课表状态文件超出限制。');
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  if(state.schema!==1 || !Number.isSafeInteger(state.revision) || state.revision<0 || !Number.isSafeInteger(state.privacy_version)
    || state.privacy_version<privacy.eraseVersion || state.privacy_version>privacy.version) fail('privacy','课表状态与当前删除权威不匹配，禁止恢复旧内容。');
  return state;
}
function save(identity,state) {
  const file=safeFile(identity,true),tmp=file+'.'+randomUUID()+'.tmp';
  const data=JSON.stringify(state);
  if(Buffer.byteLength(data)>2*1024*1024) fail('state','课表状态超出容量限制。');
  let fd;
  try {
    fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(tmp,file);
  } finally {if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
function serial(identity,expected,action) {
  const key=memoryNamespace(identity);
  const next=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(()=>withinAuthority(identity,expected,privacy=>{
    const state=load(identity,privacy);
    return action(state,privacy,()=>{state.privacy_version=privacy.version;save(identity,state);});
  }));
  queues.set(key,next);next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>{});
  return next;
}
function sourceFile(identity,value) {
  const root=qqWorkspace(identity);
  if(typeof value!=='string' || !value || value.length>600) fail('file','请选择当前私聊工作目录中的CSV文件。');
  const full=scopedPath(root,value);
  const fd=fs.openSync(full,'r');
  try {
    const stat=fs.fstatSync(fd);
    if(!stat.isFile() || stat.size>TIMETABLE_LIMITS.bytes || path.extname(full).toLowerCase()!=='.csv') fail('file','只接受当前私聊目录内、不超过128 KiB的CSV普通文件。');
    const bytes=fs.readFileSync(fd);
    if(bytes.length>TIMETABLE_LIMITS.bytes) fail('file','CSV读取时超出128 KiB限制。');
    let csv;try{csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('encoding','请从Excel另存为 CSV UTF-8；本版不接受GBK、XLSX或ICS。');}
    return {csv,source:{relative_path:path.relative(root,full).replace(/\\/g,'/'),file_name:path.basename(full),sha256:digest(bytes),bytes:bytes.length}};
  } finally {fs.closeSync(fd);}
}
export function findTimetableFile(value,name='') {
  const i=identityOf(value),root=qqWorkspace(i);
  if(name && (name.includes('/') || name.includes('\\') || path.isAbsolute(name))) return scopedPath(root,name);
  const incoming=path.join(root,'incoming');
  const matches=[];
  for(const folder of [incoming,root]) {
    if(!fs.existsSync(folder))continue;
    scopedPath(root,folder);
    for(const e of fs.readdirSync(folder,{withFileTypes:true})) {
      if(!e.isFile() || !e.name.toLowerCase().endsWith('.csv'))continue;
      const current=e.name.toLowerCase(),requested=name.toLowerCase();
      if(name && current!==requested && !current.endsWith('-'+requested))continue;
      matches.push(scopedPath(root,path.join(folder,e.name)));
    }
    // The downloaded upload wins over an unchanged template with the same name.
    if(matches.length) break;
  }
  if(matches.length!==1) fail('selection',matches.length?'找到多个CSV，请提供完整文件名或当前私聊目录内的相对路径。':'未找到CSV；请先在当前私聊上传文件，再发送“预览课表：文件名.csv”。');
  return matches[0];
}
function pending(state,privacy,kind,entry) {
  const token=randomBytes(12).toString('hex'),now=Date.now();
  state.pending={kind,entry,token_hash:digest(token),base_revision:state.revision,privacy_version:privacy.version,expires_at:now+600000};
  return {status:'preview',kind,confirmation:token,expires_at:new Date(now+600000).toISOString(),base_revision:state.revision,
    source:entry?.source||null,...(entry?{preview:timetablePreviewPage(entry.model)}:{}),replaces_existing:Boolean(state.active),
    message:kind==='clear'?'确认后清空当前和上一修订；上传CSV与聊天原文保留。':'仅预览，当前课表尚未改变。确认后替换整个课表，保留上一修订。'};
}
export async function previewTimetableImport(value,filePath,{messageId=''}={}) {
  const i=identityOf(value),version=privacyState(i).version;
  const input=sourceFile(i,filePath),model=parseTimetableCsv(input.csv);
  const entry={model,source:{...input.source,message_id:String(messageId).slice(0,200)},confirmed_at:null};
  return serial(i,version,(state,privacy,commit)=>{const result=pending(state,privacy,'import',entry);commit();return result;});
}
export async function previewTimetableAction(value,kind) {
  const i=identityOf(value),version=privacyState(i).version;
  if(!['rollback','clear'].includes(kind)) fail('action','不支持的课表变更。');
  return serial(i,version,(state,privacy,commit)=>{
    if(kind==='rollback' && !state.previous) fail('previous','没有可回退的上一修订。');
    const result=pending(state,privacy,kind,kind==='rollback'?state.previous:null);commit();return result;
  });
}
export async function confirmTimetable(value,token) {
  const i=identityOf(value),version=privacyState(i).version;
  if(typeof token!=='string' || !/^[a-f0-9]{24}$/.test(token)) fail('confirmation','课表确认码无效。');
  return serial(i,version,(state,privacy,commit)=>{
    const p=state.pending;
    if(!p || p.expires_at<=Date.now() || p.base_revision!==state.revision || p.privacy_version!==privacy.version
      || !timingSafeEqual(Buffer.from(p.token_hash,'hex'),Buffer.from(digest(token),'hex'))) fail('confirmation','课表预览已过期、已替换或确认码不属于当前私聊，请重新预览。');
    if(state.revision>=Number.MAX_SAFE_INTEGER) fail('state','课表修订号已达上限。');
    if(p.kind==='import') {
      const actual=sourceFile(i,p.entry.source.relative_path);
      if(actual.source.sha256!==p.entry.source.sha256) fail('source_changed','CSV已在预览后改变，请重新预览；当前课表未改变。');
    }
    state.revision++;
    if(p.kind==='clear') {state.active=null;state.previous=null;}
    else {state.previous=state.active;state.active={...p.entry,revision:state.revision,confirmed_at:new Date().toISOString()};}
    state.pending=null;commit();
    return {status:'confirmed',revision:state.revision,active:Boolean(state.active),term:state.active?.model.term||null,
      message:state.active?'课表已确认生效；这是计划安排，不代表实际到课。':'已清空当前课表和上一修订；上传CSV及聊天原文保留。'};
  });
}
export function readTimetable(value,args={}) {
  const i=identityOf(value);
  if(!args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).some(k=>!['operation','date','page'].includes(k))) fail('arguments','课表查询参数无效，不允许指定其他身份。');
  if(Object.values(args).some(v=>typeof v!=='string' || v.length>30)) fail('arguments','课表查询参数无效。');
  return withinAuthority(i,undefined,privacy=>{
    const state=load(i,privacy);
    if(args.operation==='preview_page') {
      if(!state.pending?.entry || state.pending.expires_at<=Date.now()) return {status:'no_preview',message:'没有有效预览，请重新预览CSV。'};
      if(!/^\d{1,3}$/.test(args.page||'1')) fail('page','预览页码须为整数。');
      return {status:'preview_page',preview:timetablePreviewPage(state.pending.entry.model,+(args.page||'1')),source:state.pending.entry.source};
    }
    if((args.operation||'status')==='status') return {status:'ok',revision:state.revision,active:Boolean(state.active),term:state.active?.model.term||null,
      source:state.active?.source||null,has_previous:Boolean(state.previous),pending:state.pending?{kind:state.pending.kind,expires_at:new Date(state.pending.expires_at).toISOString()}:null};
    if(!state.active) return {status:'not_configured',message:'当前私聊没有已确认课表，请先上传CSV并预览确认。'};
    return {...queryTimetable(state.active.model,args),revision:state.revision,source_file:{file_name:state.active.source.file_name,sha256:state.active.source.sha256}};
  });
}
