import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {EvidenceStore} from '../dsh-hymemory-plugin/evidence.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-retention-test-'));
process.env.QQBOT_PRIVACY_DIR=path.join(root,'privacy');
fs.mkdirSync(process.env.QQBOT_PRIVACY_DIR);
const privacy=new DatabaseSync(path.join(process.env.QQBOT_PRIVACY_DIR,'lifecycle.sqlite3'));
privacy.exec('PRAGMA user_version=1; CREATE TABLE privacy_spaces(namespace TEXT PRIMARY KEY,version INTEGER); CREATE TABLE privacy_operations(namespace TEXT,status TEXT); CREATE TABLE privacy_sources(namespace TEXT,source_id TEXT);');
const file=path.join(root,'evidence.sqlite3'),store=new EvidenceStore(file);
const identity={appId:'synthetic-app',scope:'c2c',peerId:'person-a',senderId:'person-a'};
const old=store.inbound(identity,{messageId:'old',content:'旧内容'});
const current=store.inbound(identity,{messageId:'current',content:'本轮内容'});
test.after(()=>{store.close();privacy.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-retention-test-/);fs.rmSync(root,{recursive:true,force:true});});
test('assistant journal separates direct sources while preserving full dependencies and payload',()=>{
  const payload={target:{scope:'c2c',targetId:'person-a'},markdown:{content:'回复'}};
  const context={identity,namespace:memoryNamespace(identity),inboundIds:[old.id,current.id],turnInboundIds:[current.id],kind:'agent',privacyVersion:0};
  const id=store.prepare(context,payload.target,'回复',payload,'markdown');
  store.settle(id,'accepted',{id:'synthetic-receipt'});
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    const row=db.prepare('SELECT related_ids_json,raw_json FROM evidence_events WHERE id=?').get(id);
    assert.deepEqual(JSON.parse(row.related_ids_json),[old.id,current.id]);
    const raw=JSON.parse(row.raw_json);
    assert.deepEqual(raw._qqAgentEvidence,{schema:1,directSourceIds:[current.id]});
    delete raw._qqAgentEvidence;assert.deepEqual(raw,payload);
    assert.equal(db.prepare('SELECT count(*) n FROM evidence_jobs WHERE source_event_id=?').get(id).n,1);
  }finally{db.close();}
});
test('a forged direct source cannot be recorded outside the full dependency set',()=>{
  const context={identity,inboundIds:[current.id],turnInboundIds:['foreign-source'],kind:'agent',privacyVersion:0};
  assert.throws(()=>store.prepare(context,{scope:'c2c',targetId:'person-a'},'reply',{},'markdown'),/DirectSourcesInvalid/);
});
