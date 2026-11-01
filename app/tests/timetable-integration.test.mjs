import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { qqIdentity,memoryNamespace } from '../dsh-hymemory-plugin/identity.js';
import { qqWorkspace,qqToolDenial } from '../dsh-hymemory-plugin/workspace.js';
import { previewTimetableImport,previewTimetableAction,confirmTimetable,readTimetable,findTimetableFile } from '../dsh-hymemory-plugin/timetable-store.js';
import { beforeTimetableTurn,installTimetable } from '../dsh-hymemory-plugin/timetable.js';
import { beforeQQTurn } from '../dsh-hymemory-plugin/bridge.js';
import { archiveQQInbound,closeQQEvidence } from '../dsh-hymemory-plugin/evidence.js';
import { fixtureRows,csv } from './timetable-fixtures.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qq-timetable-'));
Object.assign(process.env,{QQBOT_APPID:'tt-test',QQBOT_TIMETABLE_ENABLED:'true',QQBOT_PRIVACY_REQUIRED:'true',
  QQBOT_PRIVACY_DIR:path.join(temp,'privacy'),QQBOT_EVIDENCE_DIR:path.join(temp,'evidence'),
  QQBOT_WORKSPACE_ROOT:path.join(temp,'workspaces'),QQBOT_COMPANION_DIR:path.join(temp,'companion'),
  QQBOT_MODEL_ROUTING_FILE:path.join(temp,'routing.json'),MEMORY_BRIDGE_URL:'http://127.0.0.1:1',MEMORY_BRIDGE_TOKEN:'synthetic'});
fs.mkdirSync(process.env.QQBOT_PRIVACY_DIR);
const db=new DatabaseSync(path.join(process.env.QQBOT_PRIVACY_DIR,'lifecycle.sqlite3'));
db.exec('CREATE TABLE privacy_spaces(namespace TEXT PRIMARY KEY,version INTEGER); CREATE TABLE privacy_operations(id TEXT PRIMARY KEY,namespace TEXT,version INTEGER,mode TEXT,status TEXT); CREATE TABLE privacy_sources(namespace TEXT,source_id TEXT); PRAGMA user_version=1;');
let seq=0;
const who=()=>qqIdentity({appId:'tt-test',scope:'c2c',peerId:'person-'+(++seq)});
const stateFile=i=>path.join(temp,'timetables',memoryNamespace(i)+'.json');
function source(i,rows=fixtureRows(),name='course.csv') {const p=path.join(qqWorkspace(i),name);fs.writeFileSync(p,csv(rows));return p;}
async function active(i,rows=fixtureRows()) {const p=await previewTimetableImport(i,source(i,rows));return confirmTimetable(i,p.confirmation);}
function registered() {let definition;installTimetable({get:n=>n==='tools'?{register:d=>definition=d}:{section(){}}});return definition;}
test.after(()=>{closeQQEvidence();db.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('qq-timetable-'));fs.rmSync(temp,{recursive:true,force:true});});

test('preview does not change the current authority and needs single-use raw confirmation',async()=>{
  const i=who(),p=await previewTimetableImport(i,source(i));assert.equal(readTimetable(i).active,false);
  const stored=JSON.parse(fs.readFileSync(stateFile(i),'utf8'));assert.equal(JSON.stringify(stored).includes(p.confirmation),false);
  assert.equal((await confirmTimetable(i,p.confirmation)).revision,1);assert.equal(readTimetable(i).active,true);
  await assert.rejects(confirmTimetable(i,p.confirmation),/过期/);assert.equal(readTimetable(i).revision,1);
});
test('a new preview invalidates the previous token without losing the existing timetable',async()=>{
  const i=who();await active(i);const a=await previewTimetableImport(i,source(i));const b=await previewTimetableImport(i,source(i));
  await assert.rejects(confirmTimetable(i,a.confirmation));assert.equal(readTimetable(i).revision,1);await confirmTimetable(i,b.confirmation);assert.equal(readTimetable(i).revision,2);
});
test('malformed import cannot replace an existing confirmed timetable',async()=>{
  const i=who();await active(i);const p=path.join(qqWorkspace(i),'broken.csv');fs.writeFileSync(p,'not,a,timetable');
  await assert.rejects(previewTimetableImport(i,p));assert.equal(readTimetable(i).revision,1);assert.equal(readTimetable(i).active,true);
});
test('changing source bytes after preview rejects confirmation while keeping current data',async()=>{
  const i=who();await active(i);const p=source(i);const preview=await previewTimetableImport(i,p);fs.appendFileSync(p,'\r\n');
  await assert.rejects(confirmTimetable(i,preview.confirmation),/改变/);assert.equal(readTimetable(i).revision,1);
});
test('private identities cannot share tokens, files, results or scope parameters',async()=>{
  const a=who(),b=who(),file=source(a),p=await previewTimetableImport(a,file);
  await assert.rejects(confirmTimetable(b,p.confirmation));await assert.rejects(previewTimetableImport(b,file));
  await confirmTimetable(a,p.confirmation);assert.equal(readTimetable(b).active,false);assert.throws(()=>readTimetable(b,{namespace:memoryNamespace(a)}));
});
test('bound and unbound groups both fail closed for private timetable operations',async()=>{
  const g=qqIdentity({appId:'tt-test',scope:'group',peerId:'room',senderId:'controller'});
  assert.throws(()=>readTimetable(g),/私聊/);assert.match((await beforeTimetableTurn({identity:g,text:'今日课表'})).reply,/私聊/);
});
test('rollback restores confirmed data with a new monotonic revision',async()=>{
  const i=who();await active(i);const r=fixtureRows();r[4]['名称']='第二版';await active(i,r);assert.equal(readTimetable(i).revision,2);
  const p=await previewTimetableAction(i,'rollback');assert.equal(readTimetable(i).revision,2);await confirmTimetable(i,p.confirmation);
  const q=readTimetable(i,{operation:'date',date:'2026-08-31'});assert.equal(q.items[0].name,'合成数学');assert.equal(q.revision,3);
});
test('clear needs confirmation and removes current/previous snapshots while retaining original CSV',async()=>{
  const i=who();await active(i);const file=source(i);const p=await previewTimetableAction(i,'clear');assert.equal(readTimetable(i).active,true);
  await confirmTimetable(i,p.confirmation);assert.equal(readTimetable(i).active,false);assert.equal(readTimetable(i).has_previous,false);assert.equal(fs.existsSync(file),true);
});
test('pending deletion blocks reads, previews and commits without modifying state',async()=>{
  const i=who();await active(i);const file=stateFile(i),before=fs.readFileSync(file,'utf8');
  db.prepare('INSERT INTO privacy_operations VALUES(?,?,?,?,?)').run('pending-'+seq,memoryNamespace(i),1,'erase','pending');
  assert.throws(()=>readTimetable(i),/清理/);await assert.rejects(previewTimetableImport(i,source(i)));assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('logical forgetting leaves confirmed courses intact but invalidates old pending previews',async()=>{
  const i=who();await active(i);const p=await previewTimetableAction(i,'clear');
  db.prepare('INSERT INTO privacy_spaces VALUES(?,?)').run(memoryNamespace(i),1);
  db.prepare('INSERT INTO privacy_operations VALUES(?,?,?,?,?)').run('forget-'+seq,memoryNamespace(i),1,'forget','complete');
  assert.equal(readTimetable(i).active,true);await assert.rejects(confirmTimetable(i,p.confirmation));
});
test('an old restored timetable cannot reappear after completed physical erasure',async()=>{
  const i=who();await active(i);db.prepare('INSERT INTO privacy_spaces VALUES(?,?)').run(memoryNamespace(i),2);
  db.prepare('INSERT INTO privacy_operations VALUES(?,?,?,?,?)').run('erase-'+seq,memoryNamespace(i),2,'erase','complete');
  assert.throws(()=>readTimetable(i),/删除权威/);
});
test('an incomplete authority cannot silently bypass the physical-erasure fence',()=>{
  const i=who(),old=process.env.QQBOT_PRIVACY_DIR,folder=path.join(temp,'incomplete-privacy');fs.mkdirSync(folder);
  const other=new DatabaseSync(path.join(folder,'lifecycle.sqlite3'));
  other.exec('CREATE TABLE privacy_spaces(namespace TEXT PRIMARY KEY,version INTEGER);CREATE TABLE privacy_operations(id TEXT,namespace TEXT,status TEXT);CREATE TABLE privacy_sources(namespace TEXT,source_id TEXT);PRAGMA user_version=1;');
  process.env.QQBOT_PRIVACY_DIR=folder;
  try{assert.throws(()=>readTimetable(i),/缺少物理删除/);}finally{process.env.QQBOT_PRIVACY_DIR=old;other.close();}
});
test('expired preview cannot be committed',async()=>{
  const i=who(),p=await previewTimetableImport(i,source(i));const file=stateFile(i),s=JSON.parse(fs.readFileSync(file));s.pending.expires_at=1;fs.writeFileSync(file,JSON.stringify(s));
  await assert.rejects(confirmTimetable(i,p.confirmation));assert.equal(readTimetable(i).active,false);
});
test('confirmed import survives a fresh process and does not depend on memory service',async()=>{
  const i=who();await active(i);const module=new URL('../dsh-hymemory-plugin/timetable-store.js',import.meta.url).href;
  const r=spawnSync(process.execPath,['--input-type=module','-e',`import {readTimetable} from ${JSON.stringify(module)};console.log(JSON.stringify(readTimetable(${JSON.stringify(i)})));`],{encoding:'utf8',env:process.env,windowsHide:true});
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).revision,1);
});
test('a later privacy revision fences an old tool turn',async()=>{
  const i=who();const tool=registered();db.prepare('INSERT INTO privacy_spaces VALUES(?,?)').run(memoryNamespace(i),1);
  const agent={[Symbol.for('qqbot.identity')]:i,[Symbol.for('qqbot.evidence')]:{identity:i,privacyVersion:0,inboundIds:[]}};
  await assert.rejects(tool.execute({operation:'status'},{agent}),/QQPrivacyContextExpired/);
});
test('tool has no commit/clear/rollback or arbitrary-identity capability',async()=>{
  const i=who(),tool=registered(),agent={[Symbol.for('qqbot.identity')]:i};
  assert.equal(tool.parameters.properties.operation.enum.includes('confirm'),false);
  await assert.rejects(tool.execute({operation:'confirm'},{agent}));await assert.rejects(tool.execute({operation:'status',owner:'another'},{agent}));
  await assert.rejects(tool.execute({},{agent:{}}));
});
test('existing file/tool guard allows scoped timetable use and blocks history-only execution',()=>{
  const i=who(),root=qqWorkspace(i),agent={[Symbol.for('qqbot.identity')]:i,session:{},ctx:{get:()=>({get:()=>root})}};
  assert.equal(qqToolDenial({agent,name:'qqbot_timetable',arguments:{operation:'status'}}),undefined);
  agent[Symbol.for('qqbot.history.readonly')]=true;assert.match(qqToolDenial({agent,name:'qqbot_timetable',arguments:{operation:'status'}}),/历史问答/);
});
test('current QQ command entry handles preview, confirmation and querying without an LLM or network',async()=>{
  const i=who();source(i);let calls=0;const saved=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('No network');};
  try {
    const p=await beforeQQTurn({identity:i,text:'预览课表：course.csv',messageId:'synthetic-import'});assert.equal(p.handled,true);assert.match(p.reply,/尚未生效/);
    const token=/确认课表：([a-f0-9]{24})/.exec(p.reply)[1];assert.match((await beforeQQTurn({identity:i,text:'确认课表：'+token})).reply,/生效/);
    assert.match((await beforeQQTurn({identity:i,text:'课表日期：2026-08-31'})).reply,/合成数学/);assert.equal(calls,0);
  }finally{globalThis.fetch=saved;}
});
test('incoming UUID-prefixed CSV is resolved by original name while ambiguous selection is rejected',()=>{
  const i=who(),incoming=path.join(qqWorkspace(i),'incoming');fs.mkdirSync(incoming);const file=path.join(incoming,'uuid-course.csv');fs.writeFileSync(file,csv(fixtureRows()));
  assert.equal(findTimetableFile(i,'course.csv'),file);fs.writeFileSync(path.join(incoming,'uuid2-course.csv'),csv(fixtureRows()));assert.throws(()=>findTimetableFile(i,'course.csv'),/多个/);
});
test('an uploaded CSV is preferred to the unchanged local template of the same name',()=>{
  const i=who(),root=qqWorkspace(i);fs.writeFileSync(path.join(root,'template.csv'),csv(fixtureRows()));
  const incoming=path.join(root,'incoming');fs.mkdirSync(incoming);const uploaded=path.join(incoming,'upload-template.csv');fs.writeFileSync(uploaded,csv(fixtureRows()));
  assert.equal(findTimetableFile(i,'TEMPLATE.CSV'),uploaded);assert.equal(findTimetableFile(i),uploaded);
});
test('upload formats other than UTF-8 CSV cannot enter the authority',async()=>{
  const i=who(),root=qqWorkspace(i),p=path.join(root,'GBK.csv');fs.writeFileSync(p,Buffer.from([0xff,0xfe,0x00]));
  await assert.rejects(previewTimetableImport(i,p),/UTF-8/);const x=path.join(root,'file.xlsx');fs.writeFileSync(x,'x');await assert.rejects(previewTimetableImport(i,x),/CSV/);
});
test('current control messages retain their original evidence without long-term extraction jobs',async()=>{
  const i=who(),ctx={message:{kind:'c2c',senderId:i.peerId,messageId:'evidence-'+seq,content:'今日课表'},state:{}};
  await archiveQQInbound(ctx,async()=>{},'tt-test');assert.equal(ctx.state.qqEvidence.eligible,false);
  const evidence=new DatabaseSync(path.join(process.env.QQBOT_EVIDENCE_DIR,'qq-evidence.sqlite3'),{readOnly:true});
  try{assert.equal(evidence.prepare('SELECT COUNT(*) n FROM evidence_jobs WHERE namespace=?').get(memoryNamespace(i)).n,0);}finally{evidence.close();}
});
test('template command writes only a local example and does not activate or overwrite a timetable',async()=>{
  const i=who();assert.match((await beforeTimetableTurn({identity:i,text:'课表模板'})).reply,/示例/);const p=path.join(qqWorkspace(i),'课表导入模板.csv');
  fs.appendFileSync(p,'\r\n');const before=fs.readFileSync(p,'utf8');await beforeTimetableTurn({identity:i,text:'课表模板'});assert.equal(fs.readFileSync(p,'utf8'),before);assert.equal(readTimetable(i).active,false);
});
test('direct command punctuation retains next-course semantics and malformed controls cannot commit',async()=>{
  const i=who();await active(i);assert.equal((await beforeTimetableTurn({identity:i,text:'下一节课？'})).handled,true);
  assert.match((await beforeTimetableTurn({identity:i,text:'确认课表：bad token'})).reply,/课表仅/);assert.equal(readTimetable(i).revision,1);
});
test('registered schemas are accepted by the actual installed DSH schema API',async()=>{
  const {assertSupportedJsonSchema}=await import(pathToFileURL('D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js').href);
  const t=registered();assertSupportedJsonSchema(t.parameters);assertSupportedJsonSchema(t.output.schema);
});
test('feature switch prevents commands, state access and import preview',async()=>{
  const i=who(),p=source(i);process.env.QQBOT_TIMETABLE_ENABLED='false';
  try{assert.throws(()=>readTimetable(i),/关闭/);await assert.rejects(previewTimetableImport(i,p));assert.match((await beforeTimetableTurn({identity:i,text:'今日课表'})).reply,/关闭/);assert.equal(fs.existsSync(stateFile(i)),false);}
  finally{process.env.QQBOT_TIMETABLE_ENABLED='true';}
});
