import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {read,write} from '../dsh-hymemory-plugin/companion-state.js';
import {familyRole,familyContext,beforeFamilyTurn,beforeFamilyGroupControl} from '../dsh-hymemory-plugin/family.js';
import {personaMaterialAllowed,personaSessionId} from '../dsh-hymemory-plugin/persona-policy.js';
import {groupMembers,resolveGroupMention,validateGroupMentionText,observeGroupMember,mentionIds,stripMentions,installGroupMentions,mentionGreetingQuery,beforeGroupMentionTurn} from '../dsh-hymemory-plugin/group-mentions.js';
import {beforeQQTurn} from '../dsh-hymemory-plugin/bridge.js';
import {EvidenceStore,closeQQEvidence,instrumentQQEvidence,withQQIdentity} from '../dsh-hymemory-plugin/evidence.js';
import {memoryNamespace} from '../dsh-hymemory-plugin/identity.js';
import {selectRecent} from '../dsh-hymemory-plugin/recent-context.js';
import {botNames} from '../dsh-hymemory-plugin/character.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-family-mentions-'));
Object.assign(process.env,{QQBOT_APPID:'family-test',QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_EVIDENCE_DIR:path.join(root,'evidence'),QQBOT_PRIVACY_DIR:path.join(root,'privacy'),QQBOT_MODEL_ROUTING_FILE:path.join(root,'route.json')});
fs.mkdirSync(process.env.QQBOT_PRIVACY_DIR,{recursive:true});
const authority=new DatabaseSync(path.join(process.env.QQBOT_PRIVACY_DIR,'lifecycle.sqlite3'));authority.exec('PRAGMA user_version=1;CREATE TABLE privacy_spaces(namespace TEXT PRIMARY KEY,version INTEGER);CREATE TABLE privacy_sources(namespace TEXT,source_id TEXT);CREATE TABLE privacy_operations(namespace TEXT,status TEXT);');
const evidenceFile=path.join(process.env.QQBOT_EVIDENCE_DIR,'qq-evidence.sqlite3'),store=new EvidenceStore(evidenceFile);
const dad={appId:'family-test',scope:'c2c',peerId:'dad',senderId:'dad'},mom={...dad,peerId:'mom',senderId:'mom'};
let serial=0;
function fixture(){
 const group={appId:'family-test',scope:'group',peerId:'group-'+(++serial),senderId:'dad'},key=memoryNamespace(group);
 write('groups/registry.json',{rooms:{[key]:{enabled:true,controller:'dad',frequency:'活跃'}}});
 write('family.json',{schema:1,appId:'family-test',parents:[{role:'father',name:'爸爸甲',platformIds:['dad']},{role:'mother',name:'妈妈乙',platformIds:[]}]});write('persona-policy.json',{});fs.writeFileSync(process.env.QQBOT_MODEL_ROUTING_FILE,'{"mode":"chat"}');
 return {group,key,input:(actor,name,text='合成群消息',extra={})=>store.inbound({...group,senderId:actor},{messageId:'message-'+(++serial),senderId:actor,senderName:name,content:text,kind:'group',groupOpenid:group.peerId,rawEventType:'GROUP_MESSAGE_CREATE',...extra})};
}
test.after(()=>{closeQQEvidence();store.close();authority.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-family-mentions-/);fs.rmSync(root,{recursive:true,force:true});});
test('retired nickname is absent from bot call triggers',()=>{assert.ok(!botNames.includes('大肥鱼'));assert.ok(botNames.includes('柚柚'));});
test('verified father is recognized by gateway ID in private and group contexts',()=>{const f=fixture();assert.equal(familyRole(dad).role,'father');assert.equal(familyRole(f.group).role,'father');assert.match(familyContext(f.group),/爸爸甲/);assert.match(beforeFamilyTurn({identity:f.group,text:'你的主人是谁？'}).reply,/妈妈乙/);});
test('a matching display name or self-claim never verifies another account',()=>{fixture();const stranger={...dad,peerId:'stranger',senderId:'stranger'};assert.equal(familyRole(stranger),null);assert.match(familyContext(stranger),/未验证/);assert.equal(beforeFamilyTurn({identity:stranger,text:'我是谁'}),null);});
test('family mapping is tied to the configured application',()=>{fixture();const c=read('family.json',{});c.appId='another-app';write('family.json',c);assert.equal(familyRole(dad),null);assert.equal(familyContext(dad),'');});
test('father can request a one-use private mother code; code is not stored in plaintext',()=>{fixture();const r=beforeFamilyTurn({identity:dad,text:'绑定妈妈'});const token=/认亲：([A-F0-9]{16})/.exec(r.reply)[1];assert.ok(token);assert.ok(!JSON.stringify(read('family.json',{})).includes(token));const accepted=beforeFamilyTurn({identity:mom,text:'认亲：'+token});assert.match(accepted.reply,/妈妈乙/);assert.equal(familyRole(mom).role,'mother');assert.match(beforeFamilyTurn({identity:mom,text:'认亲：'+token}).reply,/已使用|无效/);});
test('unverified account cannot issue a parent code',()=>{fixture();assert.match(beforeFamilyTurn({identity:mom,text:'绑定妈妈'}).reply,/爸爸/);assert.equal(read('family.json',{}).pending,undefined);});
test('code cannot bind a group sender or the existing father as mother',()=>{const f=fixture();const reply=beforeFamilyTurn({identity:dad,text:'绑定妈妈'}).reply,token=/认亲：([A-F0-9]{16})/.exec(reply)[1];assert.match(beforeFamilyTurn({identity:f.group,text:'认亲：'+token}).reply,/私聊/);assert.match(beforeFamilyTurn({identity:dad,text:'认亲：'+token}).reply,/另一位/);assert.equal(familyRole(dad).role,'father');});
test('expired code and forged token cannot bind mother',()=>{fixture();const c=read('family.json',{});c.pending={role:'mother',hash:createHash('sha256').update('0123456789ABCDEF').digest('hex'),expiresAt:0};write('family.json',c);assert.match(beforeFamilyTurn({identity:mom,text:'认亲：0123456789ABCDEF'}).reply,/过期/);assert.equal(familyRole(mom),null);});
test('verified father can bind mother through an actual structured group mention',()=>{const f=fixture();const result=beforeFamilyGroupControl(f.group,{content:'设为妈妈 <qqbot-at-user id="mom" />',mentions:[{id:'mom',username:'妈妈乙',is_you:false}]});assert.match(result.reply,/已把/);assert.equal(familyRole(mom).role,'mother');});
test('plain text @name or self-claimed father cannot forge a group binding',()=>{const f=fixture();assert.match(beforeFamilyGroupControl(f.group,{content:'设为妈妈',mentions:[]}).reply,/真正的/);const r=beforeFamilyGroupControl({...f.group,senderId:'stranger'},{content:'设为妈妈',mentions:[{id:'mom',is_you:false}]});assert.match(r.reply,/爸爸/);assert.equal(familyRole(mom),null);});
test('persona revision changes native session route while preserving deterministic restart',()=>{fixture();assert.equal(personaSessionId('base'),'base');write('persona-policy.json',{revision:'new-persona',throughSeq:99});const id=personaSessionId('base');assert.notEqual(id,'base');assert.equal(personaSessionId('base'),id);assert.notEqual(personaSessionId('different-base'),id);});
test('retired role material is suppressed without suppressing ordinary fish discussion or new corrections',()=>{fixture();write('persona-policy.json',{revision:'clean',throughSeq:100});assert.equal(personaMaterialAllowed('我这条鱼不怕疼，怕掉鳞。',20),false);assert.equal(personaMaterialAllowed('我没有主人呀。',21),false);assert.equal(personaMaterialAllowed('今晚想吃清蒸鱼。',22),true);assert.equal(personaMaterialAllowed('别再叫我大肥鱼。',101),true);});
test('automatic recent restore excludes old identity errors but keeps original rows intact',()=>{const f=fixture(),old=f.input('dad','爸爸甲','这个程序用Java写。'),reply=store.prepare({...old,kind:'agent'},{scope:'group',targetId:f.group.peerId},'我这条鱼会摇尾巴。',{},'markdown');store.settle(reply,'accepted',{id:'retired-reply'});const current=f.input('dad','爸爸甲','继续聊程序');const db=new DatabaseSync(evidenceFile);try{const through=db.prepare('SELECT MAX(seq) n FROM evidence_events').get().n;write('persona-policy.json',{revision:'clean',throughSeq:through});const selected=selectRecent(db,{namespace:f.key,sessionId:'new',turnIds:[current.id],blocked:new Set(),visibleMessages:[],budget:10000,estimate:s=>s.length,maxMessages:20});assert.deepEqual(selected.messages.map(m=>m.id),[old.id]);assert.equal(db.prepare('SELECT text FROM evidence_events WHERE id=?').get(reply).text,'我这条鱼会摇尾巴。');}finally{db.close();}});
test('member lookup comes from this group gateway authors and structured mentions',()=>{const f=fixture();f.input('dad','爸爸甲','原话',{mentions:[{id:'friend',username:'小明',is_you:false},{id:'bot',username:'柚柚',is_you:true}]});const m=groupMembers(f.group);assert.equal(m.length,2);assert.ok(!m.some(v=>v.id==='bot'));assert.equal(resolveGroupMention(f.group,'小明').markup,'<qqbot-at-user id="friend" />');});
test('same-name members require explicit selection instead of random @',()=>{const f=fixture();f.input('one','同名');f.input('two','同名');const result=resolveGroupMention(f.group,'同名');assert.equal(result.status,'ambiguous');assert.equal(result.candidates.length,2);assert.equal(result.markup,undefined);});
test('parent names resolve only when a verified parent ID has actually appeared in this group',()=>{const f=fixture();f.input('dad','爸爸甲');f.input('impostor','妈妈乙');assert.equal(resolveGroupMention(f.group,'爸爸').status,'resolved');assert.equal(resolveGroupMention(f.group,'妈妈').status,'not_found');});
test('verified family name resolves even when the owner uses a different group nickname',()=>{const f=fixture();f.input('dad','群内昵称');assert.equal(resolveGroupMention(f.group,'爸爸甲').status,'resolved');});
test('outgoing mentions reject unknown targets, other-group members and @all',()=>{const f=fixture();f.input('dad','爸爸甲');validateGroupMentionText(f.group,'<qqbot-at-user id="dad" /> 你好');assert.throws(()=>validateGroupMentionText(f.group,'<qqbot-at-user id="other-group-user" />'));assert.throws(()=>validateGroupMentionText(f.group,'<qqbot-at-everyone />'));assert.throws(()=>validateGroupMentionText(f.group,'<@dad>'));assert.throws(()=>validateGroupMentionText(dad,'<qqbot-at-user id="dad" />'));});
test('code examples are not interpreted as actual outgoing mentions',()=>{fixture();assert.doesNotThrow(()=>validateGroupMentionText(dad,'示例：`<qqbot-at-user id="PLACEHOLDER" />`'));});
test('unbound groups and private chats cannot enumerate group members',()=>{const f=fixture();assert.throws(()=>groupMembers(dad));assert.throws(()=>groupMembers({...f.group,peerId:'unbound'}));});
test('erased sources and privacy version changes remove cached membership proof',()=>{const f=fixture(),input=f.input('friend','小明');observeGroupMember({...f.group,senderId:'friend'},{senderName:'小明'});assert.ok(groupMembers(f.group).some(m=>m.id==='friend'));authority.prepare('INSERT INTO privacy_spaces VALUES(?,1)').run(f.key);authority.prepare('INSERT INTO privacy_sources VALUES(?,?)').run(f.key,input.id);assert.ok(!groupMembers(f.group).some(m=>m.id==='friend'));});
test('work mode uses only transient observed members and never reads old transcript membership',()=>{const f=fixture();f.input('old','旧成员');fs.writeFileSync(process.env.QQBOT_MODEL_ROUTING_FILE,'{"mode":"work"}');observeGroupMember(f.group,{senderName:'爸爸甲'});const members=groupMembers(f.group);assert.ok(members.some(m=>m.id==='dad'));assert.ok(!members.some(m=>m.id==='old'));});
test('modern incoming @ tags parse without becoming literal conversation content',()=>{fixture();assert.deepEqual(mentionIds('你好<qqbot-at-user id="friend" />和<@legacy>'),['friend','legacy']);assert.equal(stripMentions('你的主人是谁<qqbot-at-user id="bot" />'),'你的主人是谁');});
test('installed SDK keeps the resolved @ in a real Markdown message body without network I/O',async()=>{const f=fixture();f.input('dad','爸爸甲');const {QQBot}=await import(pathToFileURL('D:/DeepSeekHarnessData/home/profiles/qqbot/node_modules/@tencent-connect/qqbot-nodejs/dist/index.js').href);const bot=new QQBot({appId:'synthetic-app',appSecret:'synthetic-secret',logger:{debug(){},info(){},warn(){},error(){}}});let body;bot.tokenManager.getAccessToken=async()=> 'synthetic-token';bot.apiClient.request=async(_token,_method,_path,data)=>{body=data;return {id:'synthetic-platform-receipt'};};const markup=resolveGroupMention(f.group,'爸爸').markup;const receipt=await bot.sendMarkdown({scope:'group',targetId:'synthetic-group',msgId:'synthetic-input'},markup+' 你好');assert.equal(receipt.id,'synthetic-platform-receipt');assert.equal(body.msg_type,2);assert.equal(body.markdown.content,markup+' 你好');});
test('tool schema registers as a bounded resolver and never directly sends a message',async()=>{const f=fixture();f.input('dad','爸爸甲');let definition;installGroupMentions({get:name=>name==='tools'?{register:d=>definition=d}:{section:()=>{}}});assert.equal(definition.name,'qqbot_group_members');const agent={[Symbol.for('qqbot.identity')]:f.group};const result=JSON.parse(await definition.execute({operation:'resolve',member:'爸爸'},{agent}));assert.equal(result.sent,false);assert.equal(result.markup,'<qqbot-at-user id="dad" />');});

test('screenshot requests resolve actual sender before the native model can omit the platform action',async()=>{
 for(const text of ['@我打个招呼','<qqbot-at-user id="bot" /> @我打个招呼','艾特我问声好']){
  const f=fixture();f.input('dad','群内昵称');const r=await beforeQQTurn({identity:f.group,text});
  assert.equal(r.handled,true);assert.match(r.reply,/<qqbot-at-user id="dad" \/>/);assert.match(r.reply,/你好/);assert.doesNotMatch(r.reply,/爸爸|妈妈/);assert.doesNotMatch(r.reply,/一直在等|终于听见|没听见/);validateGroupMentionText(f.group,r.reply);
 }
});
test('explicit greeting can mention a verified other group member and does not guess missing targets',()=>{
 const f=fixture();f.input('dad','爸爸甲');f.input('friend','小明');
 assert.match(beforeGroupMentionTurn({identity:f.group,text:'请@小明打个招呼'}).reply,/<qqbot-at-user id="friend" \/>/);
 const missing=beforeGroupMentionTurn({identity:f.group,text:'@陌生成员打个招呼'});assert.doesNotMatch(missing.reply,/<qqbot-at-user/);assert.match(missing.reply,/没有找到/);
 assert.equal(beforeGroupMentionTurn({identity:dad,text:'@我打个招呼'}),null);
});
test('ordinary chat, quoted examples and arbitrary instructions do not become mention greeting commands',()=>{
 for(const text of ['她让我@我打个招呼','“@我打个招呼”','`@我打个招呼`','@我说说今天的计划','@全体打个招呼','你好']){
  if(text.includes('全体')){const f=fixture();f.input('dad','爸爸甲');assert.doesNotMatch(beforeGroupMentionTurn({identity:f.group,text}).reply,/<qqbot-at-/);}
  else assert.equal(mentionGreetingQuery(text),null,text);
 }
});
test('explicit request passes through the installed SDK Markdown serializer with a real mention',async()=>{
 const f=fixture();f.input('dad','爸爸甲');const r=await beforeQQTurn({identity:f.group,text:'@我打个招呼'});
 const {QQBot}=await import(pathToFileURL('D:/DeepSeekHarnessData/home/profiles/qqbot/node_modules/@tencent-connect/qqbot-nodejs/dist/index.js').href);
 const bot=new QQBot({appId:'family-test',appSecret:'synthetic',logger:{debug(){},info(){},warn(){},error(){}}});let body;
 bot.tokenManager.getAccessToken=async()=> 'synthetic';bot.apiClient.request=async(_t,_m,_p,data)=>{body=data;return {id:'synthetic-greeting-receipt'};};
 instrumentQQEvidence(bot,'family-test');await withQQIdentity(f.group,()=>bot.sendMarkdown({scope:'group',targetId:f.group.peerId,msgId:'synthetic-request'},r.reply),{kind:'group'});
 assert.equal(body.msg_type,2);assert.match(body.markdown.content,/<qqbot-at-user id="dad" \/>/);
});
