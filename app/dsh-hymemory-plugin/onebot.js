import {turnSettings} from './turn-strategy.js';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {qqWorkspace,scopedPath} from './workspace.js';
import {assertPrivacyContext,privacyState} from './privacy.js';

const numeric=id=>typeof id==='string'&&/^[1-9][0-9]{4,15}$/.test(id)&&Number.isSafeInteger(Number(id));
const logical=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(id);
const packetId=id=>typeof id==='number'&&Number.isSafeInteger(id)||typeof id==='string'&&/^-?[0-9]{1,22}$/.test(id)&&Number.isSafeInteger(Number(id));
const LOCAL_FILES=Symbol.for('qqbot.onebot.local-files');
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function validateOneBotConfig(c,appId){
  if(c?.schema!==1||c.mode!=='onebot'||c.legacyAppId!==String(appId)||!numeric(c.selfId))throw failure('OneBotConfigInvalid','小号接入配置无效。');
  const u=new URL(c.url);if(u.protocol!=='ws:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.search||u.hash)throw failure('OneBotEndpointRejected','OneBot仅连接本机受保护的WebSocket。');
  if(!/^[a-f0-9]{64}$/.test(c.token))throw failure('OneBotTokenRequired','OneBot需要独立访问令牌。');
  for(const kind of ['users','groups']){
    const entries=Object.entries(c[kind]||{});if(entries.some(([physical,id])=>!numeric(physical)||!logical(id))||new Set(entries.map(([,id])=>id)).size!==entries.length)throw failure('OneBotMappingInvalid','身份映射存在无效或重复目标。');
  }
  if(!Array.isArray(c.allowedGroups)||c.allowedGroups.some(id=>!numeric(id)||!c.groups?.[id]))throw failure('OneBotGroupMappingRequired','目标群必须先明确对应原群。');
  return c;
}
export class OneBotIdentityMap{
  constructor(config){this.config=config;this.users=new Map(Object.entries(config.users||{}));this.groups=new Map(Object.entries(config.groups||{}));this.observed=new Map();}
  user(id){id=String(id);if(!numeric(id))throw failure('OneBotUserInvalid','网关用户编号无效。');const value=this.users.get(id)||`ob-user-${id}`;this.observed.set(value,id);if(this.observed.size>4096)this.observed.delete(this.observed.keys().next().value);return value;}
  group(id){id=String(id);if(!this.config.allowedGroups.includes(id)||!this.groups.has(id))throw failure('OneBotGroupUnmapped','此群未加入本次迁移。');return this.groups.get(id);}
  physical(scope,id){if(!['c2c','group'].includes(scope))throw failure('OneBotScopeInvalid','不支持此会话范围。');const source=scope==='group'?this.groups:this.users;const found=[...source].find(([,v])=>v===id)?.[0]||(scope==='c2c'?this.observed.get(id):undefined);if(!found)throw failure('OneBotTargetUnmapped','目标账号尚无可靠映射。');if(scope==='group'&&!this.config.allowedGroups.includes(found))throw failure('OneBotGroupUnmapped','目标群未授权。');return found;}
  mention(id){return this.physical('c2c',id);}
}
export function oneBotTextSegments(text,ids){
  const result=[];let position=0;
  for(const match of String(text).matchAll(/<qqbot-at-user\s+id="([A-Za-z0-9_-]+)"\s*\/>/g)){
    if(match.index>position)result.push({type:'text',data:{text:text.slice(position,match.index)}});
    result.push({type:'at',data:{qq:ids.mention(match[1])}});position=match.index+match[0].length;
  }
  if(position<text.length)result.push({type:'text',data:{text:text.slice(position)}});
  return result.length?result:[{type:'text',data:{text:String(text)}}];
}
const attachmentType={image:'image/png',record:'audio/ogg',video:'video/mp4',file:'application/octet-stream'};
export function normalizeOneBotMessage(event,ids,{quoted=false}={}){
  const c=ids.config;if(String(event.self_id)!==c.selfId||event.post_type!=='message'||!['private','group'].includes(event.message_type)||!numeric(String(event.user_id))||!packetId(event.message_id))return null;
  if(String(event.user_id)===c.selfId&&!quoted)return null;
  if(event.message_type==='private'&&event.sub_type!=='friend')return null;
  const scope=event.message_type==='group'?'group':'c2c';let group;
  if(scope==='group'){if(!c.allowedGroups.includes(String(event.group_id)))return null;group=ids.group(event.group_id);}
  if(!Array.isArray(event.message)||event.message.length>128)return null;
  const mentions=[],attachments=[],texts=[];let ref;
  for(const segment of event.message){
    const d=segment?.data||{};
    if(segment.type==='text')texts.push(String(d.text||''));
    else if(segment.type==='at'&&numeric(String(d.qq))){const id=ids.user(d.qq),self=String(d.qq)===c.selfId;mentions.push({id,username:'',is_you:self});texts.push(self?`<@!${c.legacyAppId}>`:`<qqbot-at-user id="${id}" />`);}
    else if(segment.type==='at'&&d.qq==='all')texts.push('[全体成员]');
    else if(segment.type==='reply'&&packetId(d.id))ref=String(d.id);
    else if(attachmentType[segment.type]){
      const url=String(d.url||'');if(/^https?:\/\//i.test(url))attachments.push({content_type:attachmentType[segment.type],url,filename:String(d.name||d.file||'').slice(0,180),size:Number(d.file_size)||undefined});
      else texts.push(`[收到${segment.type==='image'?'图片':segment.type==='file'?'文件':'媒体'}，本次网关没有提供可下载链接]`);
    }else if(segment.type==='face')texts.push(`[表情${String(d.id||'')}]`);
  }
  const prefix=`ob-${scope}-${scope==='group'?event.group_id:event.user_id}-`;
  return {kind:scope,rawEventType:scope==='group'?'GROUP_MESSAGE_CREATE':'C2C_MESSAGE_CREATE',senderId:ids.user(event.user_id),senderName:String(event.sender?.card||event.sender?.nickname||'').slice(0,80),senderIsBot:String(event.user_id)===c.selfId||turnSettings().knownBotIds.includes(ids.user(event.user_id)),groupOpenid:group,content:texts.join(''),messageId:prefix+event.message_id,msgIdx:prefix+event.message_id,refMsgIdx:ref===undefined?undefined:prefix+ref,timestamp:new Date(Number(event.time)*1000||Date.now()).toISOString(),mentions,attachments,raw:event};
}

export function normalizeOneBotFileNotice(event){
  if(event.post_type!=='notice'||!['offline_file','group_upload'].includes(event.notice_type)||typeof event.file?.id!=='string'||!event.file.id||event.file.id.length>512||!numeric(String(event.user_id)))return null;
  const group=event.notice_type==='group_upload';
  return {...event,post_type:'message',message_type:group?'group':'private',sub_type:'friend',message_id:0,message:[{type:'file',data:{file_id:event.file.id,name:event.file.name,url:event.file.url,file_size:event.file.size}}]};
}

export class OneBotConnection{
  constructor(config,{WebSocketClass=WebSocket,status=()=>{},onMessage=async()=>{},onReady=async()=>{}}={}){this.config=config;this.WebSocketClass=WebSocketClass;this.status=status;this.onMessage=onMessage;this.onReady=onReady;this.pending=new Map();this.online=false;this.closed=true;this.generation=0;}
  rpc(action,params={},duringLogin=false){
    if(!this.socket||this.socket.readyState!==1||(!this.online&&!duringLogin))return Promise.reject(failure('OneBotOffline','QQ小号尚未登录或连接已断开。'));
    if(this.pending.size>=128)return Promise.reject(failure('OneBotBusy','QQ接口请求过多。'));
    const echo=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(echo);reject(failure('OneBotReceiptUnknown','QQ接口未返回确认，发送状态未知，不自动重发。'));},30000);timer.unref();this.pending.set(echo,{resolve,reject,timer});try{this.socket.send(JSON.stringify({action,params,echo}));}catch{clearTimeout(timer);this.pending.delete(echo);reject(failure('OneBotDisconnected','QQ接口已断开。'));}});
  }
  start(){if(!this.closed)throw failure('OneBotAlreadyStarted','接入已经启动。');this.closed=false;return new Promise(resolve=>{this.resolveStopped=resolve;this.connect();});}
  connect(){
    if(this.closed)return;const generation=++this.generation;this.status('connecting');const u=new URL(this.config.url);u.searchParams.set('access_token',this.config.token);
    const socket=new this.WebSocketClass(u.href);this.socket=socket;
    socket.addEventListener('open',async()=>{try{const info=await this.rpc('get_login_info',{},true);if(String(info.user_id)!==this.config.selfId){this.status('wrong_account');this.stop();return;}if(generation!==this.generation||this.closed)return;this.online=true;this.status('ready');await this.onReady(info);}catch{if(!this.closed)socket.close();}});
    socket.addEventListener('message',event=>{
      if(generation!==this.generation||typeof event.data!=='string'||event.data.length>8*1024*1024)return;let p;try{p=JSON.parse(event.data);}catch{return;}
      if(typeof p.echo==='string'&&this.pending.has(p.echo)){const call=this.pending.get(p.echo);this.pending.delete(p.echo);clearTimeout(call.timer);if(p.status==='ok'&&p.retcode===0)call.resolve(p.data);else call.reject(failure('OneBotAPIRejected','QQ接口拒绝了本次操作（'+String(Number(p.retcode)||'unknown')+'）。'));return;}
      if(this.online&&['message','notice'].includes(p.post_type)&&String(p.self_id)===this.config.selfId)void this.onMessage(p).catch(()=>this.status('message_failed'));
    });
    socket.addEventListener('error',()=>{});
    socket.addEventListener('close',()=>{if(generation!==this.generation)return;this.online=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(failure('OneBotDisconnected','QQ连接中断，未确认操作不会自动重放。'));}this.pending.clear();if(!this.closed){this.status('reconnecting');this.timer=setTimeout(()=>this.connect(),5000);this.timer.unref();}});
  }
  stop(){this.closed=true;this.online=false;++this.generation;clearTimeout(this.timer);for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(failure('OneBotStopped','QQ接入已停止。'));}this.pending.clear();this.socket?.close();this.resolveStopped?.();}
}
function mediaFile(source){
  if(Buffer.isBuffer(source))return 'base64://'+source.toString('base64');
  if(typeof source==='string')return /^https?:\/\/|^file:\/\/\/|^base64:\/\//.test(source)?source:pathToFileURL(path.resolve(source)).href;
  if(source?.buffer)return 'base64://'+Buffer.from(source.buffer).toString('base64');
  if(source?.url)return source.url;
  if(source?.localPath)return pathToFileURL(path.resolve(source.localPath)).href;
  throw failure('OneBotMediaInvalid','没有可发送的真实媒体文件。');
}
const sourceOptions=source=>Buffer.isBuffer(source)?{buffer:source}:typeof source==='string'?/^https?:\/\//.test(source)?{url:source}:{localPath:source}:source;
export function configureQQTransport(bot,config,options={}){
  const file=process.env.QQBOT_TRANSPORT_FILE||path.resolve('data/transport/onebot.json');let c;
  try{c=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT')return bot;throw e;}
  if(c.mode==='official')return bot;validateOneBotConfig(c,config.appId);const ids=new OneBotIdentityMap(c);
  const status=state=>{try{const target=path.join(path.dirname(file),'status.json');fs.writeFileSync(target,JSON.stringify({mode:'onebot',state,updatedAt:new Date().toISOString()}),{mode:0o600});}catch{}};
  const outgoingPeers=new Map();
  const connection=new OneBotConnection(c,{...options,status,onReady:async info=>{console.log('[im-onebot] Personal-account transport ready (identity verified)');await bot.emit('ready',{user:{id:ids.user(c.selfId),username:info.nickname},transport:'onebot'});},onMessage:async originalEvent=>{
    const fileNotice=normalizeOneBotFileNotice(originalEvent);const event=fileNotice||originalEvent;
    const message=normalizeOneBotMessage(event,ids);if(!message)return;
    if(fileNotice){message.raw=originalEvent;delete message.msgIdx;message.messageId='ob-file-'+createHash('sha256').update(JSON.stringify([originalEvent.self_id,originalEvent.notice_type,originalEvent.group_id,originalEvent.user_id,originalEvent.file.id,originalEvent.time])).digest('hex');}
    for(const segment of event.message){if(segment?.type!=='file'||/^https?:\/\//i.test(segment.data?.url||''))continue;try{let f;try{f=await connection.rpc('get_file',{file_id:segment.data?.file_id||segment.data?.file});}catch(e){if(message.kind!=='group')throw e;f=await connection.rpc('get_group_file_url',{group_id:Number(event.group_id),file_id:segment.data?.file_id||segment.data?.file,busid:originalEvent.file?.busid});}const filename=path.basename(String(f.file_name||segment.data?.name||'attachment'));if(/^https?:\/\//i.test(f.url||'')){message.attachments.push({content_type:'application/octet-stream',url:f.url,filename});}else if(typeof f.file==='string'){message.attachments.push({content_type:'application/octet-stream',url:'',filename});(message[LOCAL_FILES]||=[]).push({localPath:f.file,filename});}if(message.attachments.some(a=>a.filename===filename))message.content=message.content.replace('[收到文件，本次网关没有提供可下载链接]','');}catch{}}
    if(message.refMsgIdx){try{const ref=event.message.find(s=>s.type==='reply')?.data?.id;const quote=await connection.rpc('get_msg',{message_id:Number(ref)}),sent=outgoingPeers.get(String(ref));const same=message.kind==='group'?String(quote.group_id)===String(event.group_id):quote.message_type==='private'&&([String(quote.user_id),String(quote.sender?.user_id)].includes(String(event.user_id))||(String(quote.sender?.user_id||quote.user_id)===c.selfId&&sent?.scope==='c2c'&&sent.targetId===message.senderId));if(same){const original=normalizeOneBotMessage({...quote,self_id:c.selfId,post_type:'message',message_type:event.message_type,sub_type:'friend',group_id:event.group_id,user_id:quote.user_id||quote.sender?.user_id},ids,{quoted:true});if(original){message.msgElements=[{msg_idx:message.refMsgIdx,content:original.content,attachments:original.attachments}];message.quotedIsSelf=String(quote.user_id||quote.sender?.user_id)===c.selfId;message.quotedSenderId=original.senderId;message.quotedAt=Number(quote.time)*1000||null;message.quotedText=original.content;}}}catch{}}
    await bot.handleInboundMessage(message);
  }});
  bot.opts.transport=connection;
  const send=async(target,segments)=>{const id=ids.physical(target.scope,target.targetId);const data=await connection.rpc(target.scope==='group'?'send_group_msg':'send_private_msg',{[target.scope==='group'?'group_id':'user_id']:Number(id),message:segments});const receipt={id:data?.message_id===undefined?undefined:String(data.message_id),onebotStatus:'ok'};if(receipt.id){outgoingPeers.set(receipt.id,{scope:target.scope,targetId:target.targetId});if(outgoingPeers.size>512)outgoingPeers.delete(outgoingPeers.keys().next().value);}return receipt;};
  const keyboardText=keyboard=>(keyboard?.content?.rows||[]).flatMap(r=>r.buttons||[]).map((b,i)=>`${i+1}. ${b.render_data?.label||b.id||'选项'}`).join('\n');
  bot.send=opts=>send(opts.target,oneBotTextSegments(opts.markdown?.content??opts.content??'',ids));
  bot.sendText=(target,text)=>send(target,[{type:'text',data:{text}}]);
  bot.sendTextWithKeyboard=(target,text,keyboard)=>bot.sendMarkdown(target,text,{keyboard});
  bot.sendMarkdown=(target,text,opts={})=>{const labels=keyboardText(opts.keyboard);return send(target,oneBotTextSegments(text+(labels?'\n'+labels:''),ids));};
  bot.sendTyping=async()=>{};
  bot.sendMedia=async opts=>{
    if(opts.fileType===4){const physical=ids.physical(opts.target.scope,opts.target.targetId);if(typeof opts.localPath!=='string')throw failure('OneBotFileRequiresLocal','文件发送需要本会话已落盘的真实文件。');const data=await connection.rpc(opts.target.scope==='group'?'upload_group_file':'upload_private_file',{[opts.target.scope==='group'?'group_id':'user_id']:Number(physical),file:path.resolve(opts.localPath),name:opts.fileName||opts.filename||path.basename(opts.localPath)});const message={id:data?.message_id===undefined?undefined:String(data.message_id)};return {...message,message,upload:{},onebotStatus:'ok'};}
    const type={1:'image',2:'video',3:'record'}[opts.fileType];if(!type)throw failure('OneBotMediaInvalid','不支持此媒体类型。');const segments=[{type,data:{file:mediaFile(opts)}}];if(opts.content)segments.push({type:'text',data:{text:String(opts.content)}});const message=await send(opts.target,segments);return {...message,message,upload:{}};
  };
  for(const [method,fileType] of [['sendImage',1],['sendVoice',3],['sendVideo',2]])bot[method]=(target,source,opts={})=>bot.sendMedia({target,fileType,...sourceOptions(source),content:opts.content});
  bot.sendFile=(target,source,opts={})=>bot.sendMedia({target,fileType:4,...sourceOptions(source),fileName:opts.fileName||opts.filename});
  bot.openStream=({target})=>{let text='',finished=false;return {update:async content=>{text=content;},complete:async()=>{if(finished)return;finished=true;return bot.sendMarkdown(target,text);},cancel:()=>{finished=true;}};};
  // Any unadapted REST endpoint fails instead of falling back to the official account.
  bot.apiClient.request=async()=>{throw failure('OneBotUnsupportedAPI','小号通道不支持此官方Bot专用接口。');};
  bot.onebot={connection,ids};return bot;
}

export function stageOneBotFiles(ctx){
  const items=ctx.message?.[LOCAL_FILES]||[];if(!items.length)return;
  const config=ctx.bot?.onebot?.ids?.config;if(!config)return;
  const identity={appId:config.legacyAppId,scope:ctx.message.kind,peerId:ctx.message.kind==='group'?ctx.message.groupOpenid:ctx.message.senderId,senderId:ctx.message.senderId};
  const evidence=ctx.state.qqEvidence;assertPrivacyContext(evidence);const before=privacyState(identity);if(before.pending)throw failure('OneBotPrivacyPending','正在清理本会话。');
  const root=qqWorkspace(identity),incoming=path.join(root,'incoming');fs.mkdirSync(incoming,{recursive:true});
  const staged=[];
  try{for(const f of items.slice(0,8)){
    const actual=fs.realpathSync(f.localPath);const allowed=(config.mediaRoots||[]).some(r=>{try{const rel=path.relative(fs.realpathSync(r),actual);return rel!==''&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);}catch{return false;}});if(!allowed)continue;
    const stat=fs.statSync(actual);if(!stat.isFile()||stat.size>21*1024*1024)continue;
    const filename=path.basename(f.filename).replace(/[^\p{L}\p{N}._-]/gu,'_').slice(-120)||'attachment';const target=scopedPath(root,path.join(incoming,randomUUID()+'-'+filename));fs.copyFileSync(actual,target,fs.constants.COPYFILE_EXCL);staged.push({localPath:target,filename,contentType:'application/octet-stream',size:stat.size});
  }assertPrivacyContext(evidence);const after=privacyState(identity);if(after.pending||after.version!==before.version)throw failure('OneBotPrivacyChanged','会话清理版本已变化。');ctx.state.downloadedFiles=[...(ctx.state.downloadedFiles||[]),...staged];
  }catch(e){for(const f of staged)try{fs.unlinkSync(f.localPath);}catch{}throw e;}
}
