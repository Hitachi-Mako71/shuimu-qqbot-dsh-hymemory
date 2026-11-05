import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as onebot from '../dsh-hymemory-plugin/onebot.js';
import {QQBot} from 'file:///D:/DeepSeekHarnessData/home/profiles/qqbot/node_modules/@tencent-connect/qqbot-nodejs/dist/index.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-file-pair-')),cache=path.join(root,'cache');fs.mkdirSync(cache);const file=path.join(cache,'aesthetic.html');fs.writeFileSync(file,'<html><style>body{color:red}</style></html>');
process.env.QQBOT_TRANSPORT_FILE=path.join(root,'transport.json');
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-file-pair-/);fs.rmSync(root,{recursive:true,force:true});});
const config={schema:1,mode:'onebot',legacyAppId:'synthetic-app',selfId:'90001',url:'ws://127.0.0.1:3001',token:'b'.repeat(64),users:{90002:'person'},groups:{90003:'group'},allowedGroups:['90003'],mediaRoots:[cache]};
const LOCAL=Symbol.for('qqbot.onebot.local-files');
const message={kind:'group',groupOpenid:'group',senderId:'person',[LOCAL]:[{localPath:file,filename:'aesthetic.html'}]};
const raw=(kind,id=1,text='')=>kind==='notice'?{post_type:'notice',notice_type:'group_upload',self_id:90001,user_id:90002,group_id:90003,time:1793000000+id,file:{id:'notice-'+id,name:'aesthetic.html',size:50}}:{post_type:'message',message_type:'group',self_id:90001,user_id:90002,group_id:90003,message_id:id,time:1793000000+id,message:[{type:'file',data:{file_id:'message-'+id}},...(text?[{type:'text',data:{text}}]:[])]};
test('paired file events share verified local bytes despite differing gateway file IDs',()=>{
 assert.equal(typeof onebot.createOneBotFileDeduper,'function','paired file deduper is missing');
 const duplicate=onebot.createOneBotFileDeduper(config);assert.equal(duplicate(message,raw('message')),false);assert.equal(duplicate(message,raw('notice')),true);
 assert.equal(duplicate(message,raw('message',2)),false);assert.equal(duplicate(message,raw('notice',2)),true);
 assert.equal(duplicate(message,raw('message',3,'仔细检查交互逻辑')),false,'a meaningful caption must remain a user request');
});
test('reversed pairs and concurrent repeat uploads preserve the number of genuine uploads',()=>{
 const duplicate=onebot.createOneBotFileDeduper(config);
 assert.equal(duplicate(message,raw('notice',10)),false);assert.equal(duplicate(message,raw('message',10)),true);
 assert.equal(duplicate(message,raw('message',11)),false);assert.equal(duplicate(message,raw('message',12)),false);
 assert.equal(duplicate(message,raw('notice',11)),true);assert.equal(duplicate(message,raw('notice',12)),true);
 for(const type of ['at','reply','image']){const packet=raw('message',13);packet.message.push({type,data:{qq:90001,id:1,url:'https://example.invalid/image'}});assert.equal(duplicate(message,packet),false);}
});
test('different scopes, changed bytes, unapproved files and expired pairs do not merge',()=>{
 assert.equal(typeof onebot.createOneBotFileDeduper,'function');let now=1000;const duplicate=onebot.createOneBotFileDeduper(config,{now:()=>now});
 assert.equal(duplicate(message,raw('message')),false);assert.equal(duplicate({...message,groupOpenid:'other-group'},raw('notice')),false);
 fs.appendFileSync(file,'<!-- changed -->');assert.equal(duplicate(message,raw('notice',2)),false);
 const outside=path.join(root,'private.html');fs.writeFileSync(outside,'private');assert.equal(duplicate({...message,[LOCAL]:[{localPath:outside,filename:'aesthetic.html'}]},raw('message',4)),false);
 now+=30001;assert.equal(duplicate(message,raw('message',5)),false);
});
test('actual QQ adapter delivers a message/notice pair once, keeps later uploads and captions',async()=>{
 fs.writeFileSync(process.env.QQBOT_TRANSPORT_FILE,JSON.stringify(config));let socket;
 class Socket extends EventTarget{constructor(){super();socket=this;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}packet(p){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(p)}));}send(text){const r=JSON.parse(text);queueMicrotask(()=>this.packet({echo:r.echo,status:'ok',retcode:0,data:r.action==='get_login_info'?{user_id:90001}:{file,file_name:'aesthetic.html'}}));}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}
 const bot=new QQBot({appId:'synthetic-app',appSecret:'synthetic',logger:{info(){},warn(){},debug(){},error(){}}});onebot.configureQQTransport(bot,{appId:'synthetic-app'},{WebSocketClass:Socket});
 const got=[];bot.on('message',ctx=>got.push(ctx.message.content));const running=bot.start(),tick=()=>new Promise(r=>setImmediate(r));
 try{await tick();await tick();socket.packet(raw('message'));await tick();await tick();socket.packet(raw('notice'));await tick();await tick();assert.equal(got.length,1);
  socket.packet(raw('message',2));await tick();await tick();socket.packet(raw('notice',2));await tick();await tick();assert.equal(got.length,2);
  socket.packet(raw('message',3,'仔细检查交互逻辑'));await tick();await tick();assert.equal(got.length,3);assert.match(got[2],/仔细检查交互逻辑/);
 }finally{bot.stop();await running;}
});
