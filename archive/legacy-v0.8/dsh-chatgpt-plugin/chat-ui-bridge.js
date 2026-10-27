import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { atomicJson, readJson } from './auth.js';

export const UI_PORT = 8767;
export const uiDirectory = () => process.env.QQBOT_CHAT_UI_DIR || path.resolve('data/chatgpt-chat');
const workDirectory=()=>path.resolve(process.env.QQBOT_CHAT_WORK_DIR||path.resolve('data/memory-workspace/chat-work-output'));
const DOWNLOAD_ROOT=path.resolve(os.homedir(),'Downloads');
const SAFE_EXT=new Set(['.png','.jpg','.jpeg','.webp','.gif','.pdf','.txt','.md','.csv','.json','.py','.js','.ts','.html','.css','.docx','.xlsx','.pptx','.zip']);
function safeName(value){const name=path.basename(String(value||'file')).replace(/[^\p{L}\p{N}._ -]/gu,'_').trim().slice(0,100);return name||'file';}
const equal = (a, b) => {if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function settings(directory = uiDirectory()) {
  const file = path.join(directory, 'bridge.private.json');
  let value = readJson(file);
  if (!value) {
    value = {ownerToken: randomBytes(32).toString('hex'), extensionToken: randomBytes(32).toString('hex'), extensionId: ''};
    atomicJson(file, value);
  }
  return value;
}
export function localRequest(route, body, {directory = uiDirectory(), signal, token, extensionId, port = UI_PORT} = {}) {
  const owner = token || settings(directory).ownerToken;
  return new Promise((resolve, reject) => {
    const request = http.request({hostname:'127.0.0.1',port,path:route,method:body === undefined?'GET':'POST',
      headers:{authorization:'Bearer '+owner,...(extensionId?{'x-yuzu-extension':extensionId}:{}),...(body===undefined?{}:{'content-type':'application/json'})},signal},response=>{
      let data='';response.on('data',chunk=>{data+=chunk;if(data.length>36*1024*1024)request.destroy(Error('CHAT_UI_RESPONSE_TOO_LARGE'));});
      response.on('end',()=>{let value;try{value=data?JSON.parse(data):{};}catch{return reject(Error('CHAT_UI_INVALID_RESPONSE'));}
        if(response.statusCode<200||response.statusCode>=300)return reject(Error(value.code||'CHAT_UI_UNAVAILABLE'));resolve(value);});
      response.on('error',reject);
    });request.on('error',()=>reject(Error(signal?.aborted?'CHAT_UI_CANCELLED':'CHAT_UI_OFFLINE')));if(body!==undefined)request.write(JSON.stringify(body));request.end();
  });
}
export async function serve(directory = uiDirectory(), port = UI_PORT) {
  const config=settings(directory), queue=[], active=new Map();let heartbeat={connected:false}, pairing=readJson(path.join(directory,'pairing.private.json'),{});
  const startedAt=Date.now();let attempts=[];
  const finish=(job,result,error)=>{if(!active.has(job.id))return;active.delete(job.id);clearTimeout(job.timer);job.owner.removeListener('close',job.onClose);error?job.send(503,{code:error}):job.send(200,typeof result==='string'?{text:result,outputs:[]}:{text:result.text,outputs:result.outputs||[]});};
  const readBody=async request=>{let bytes=0,parts=[];for await(const part of request){bytes+=part.length;if(bytes>36*1024*1024)throw Error('BODY_TOO_LARGE');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString()||'{}');};
  const server=http.createServer(async(request,response)=>{
    const origin=request.headers.origin||'', extension=request.headers['x-yuzu-extension']||'', supplied=(request.headers.authorization||'').replace(/^Bearer /,'');
    const extensionOrigin=/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    if(origin){if(!extensionOrigin){response.writeHead(403).end();return;}response.setHeader('access-control-allow-origin',origin);response.setHeader('vary','Origin');}
    const send=(status,value)=>{if(response.destroyed||response.writableEnded)return;response.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(value));};
    if(request.method==='OPTIONS'){response.writeHead(204,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type,x-yuzu-extension'}).end();return;}
    if(request.method==='GET'&&request.url==='/health')return send(200,{ok:true,service:'yuzu-chat-ui',startedAt,connected:Date.now()-(heartbeat.at||0)<7000&&heartbeat.connected,mode:heartbeat.mode||'unknown',temporary:!!heartbeat.temporary,work:!!heartbeat.work,status:heartbeat.status||'extension-offline',extensionVersion:heartbeat.extensionVersion||'',queued:active.size});
    const owner=equal(supplied,config.ownerToken)&&!origin;
    const allowedExtension=equal(supplied,config.extensionToken)&&extension===config.extensionId&&(!origin||origin==='chrome-extension://'+extension);
    if(request.url==='/pair'&&request.method==='POST'){
      attempts=attempts.filter(t=>Date.now()-t<60000);if(attempts.length>=8)return send(429,{code:'PAIR_RATE_LIMIT'});attempts.push(Date.now());
      const body=await readBody(request).catch(()=>({}));pairing=readJson(path.join(directory,'pairing.private.json'),{});
      if(!/^[a-p]{32}$/.test(extension)||origin&&origin!=='chrome-extension://'+extension||pairing.expiresAt<Date.now()||!equal(body.code,pairing.code))return send(403,{code:'PAIR_REJECTED'});
      config.extensionId=extension;atomicJson(path.join(directory,'bridge.private.json'),config);fs.rmSync(path.join(directory,'pairing.private.json'),{force:true});pairing={};return send(200,{token:config.extensionToken});
    }
    if(!owner&&!allowedExtension)return send(401,{code:'UNAUTHORIZED'});
    try{
      if(owner&&request.method==='POST'&&request.url==='/generate'){
        const body=await readBody(request);if(typeof body.prompt!=='string'||body.prompt.length>150000||!Array.isArray(body.files)||body.files.length>6||!Array.isArray(body.images)||body.images.length>6||!['work','legacy'].includes(body.purpose))return send(400,{code:'CHAT_UI_INVALID_INPUT'});
        if(!heartbeat.connected||Date.now()-(heartbeat.at||0)>7000||heartbeat.mode!=='chat'||(body.purpose==='work'?!heartbeat.work:!heartbeat.temporary))return send(503,{code:'CHAT_UI_NOT_READY'});
        let total=0;for(const file of body.files){if(typeof file?.data!=='string'||file.data.length>16*1024*1024||!SAFE_EXT.has(path.extname(safeName(file.name)).toLowerCase())||!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.type||''))return send(400,{code:'CHAT_UI_INVALID_FILE'});total+=Buffer.byteLength(file.data,'base64');}if(total>24*1024*1024)return send(413,{code:'CHAT_UI_FILE_TOO_LARGE'});
        if(active.size>=6)return send(429,{code:'CHAT_UI_BUSY'});
        const job={id:randomUUID(),lease:randomBytes(16).toString('hex'),purpose:body.purpose,prompt:body.prompt,files:body.files,images:body.images,outputs:[],send,owner:response,claimed:false,createdAt:Date.now()};
        job.onClose=()=>{if(!response.writableEnded)finish(job,null,'CHAT_UI_CANCELLED');};response.on('close',job.onClose);
        job.timer=setTimeout(()=>finish(job,null,'CHAT_UI_TIMEOUT'),150000);active.set(job.id,job);queue.push(job);return;
      }
      if(allowedExtension&&request.method==='POST'&&['/poll','/heartbeat'].includes(request.url)){
        const body=await readBody(request);heartbeat={at:Date.now(),connected:body.ready===true,mode:body.mode==='chat'?'chat':body.mode==='work'?'work':'unknown',temporary:body.temporary===true,work:body.work===true,status:String(body.status||'').slice(0,80),extensionVersion:/^\d+\.\d+\.\d+$/.test(body.extensionVersion||'')?body.extensionVersion:''};
        if(request.url==='/heartbeat')return send(200,{});
        if(!heartbeat.connected||heartbeat.mode!=='chat'||!heartbeat.temporary&&!heartbeat.work)return send(200,{});
        if([...active.values()].some(j=>j.claimed))return send(200,{});
        while(queue.length){const job=queue.shift();if(!active.has(job.id))continue;if(job.purpose==='work'&&!heartbeat.work||job.purpose==='legacy'&&!heartbeat.temporary){queue.unshift(job);return send(200,{});}job.claimed=true;return send(200,{job:{id:job.id,lease:job.lease,purpose:job.purpose,prompt:job.prompt,files:job.files,images:job.images,expiresAt:job.createdAt+150000}});}return send(200,{});
      }
      if(allowedExtension&&request.method==='POST'&&request.url==='/download'){
        const body=await readBody(request),job=active.get(body.id);if(!job||!job.claimed||!equal(body.lease,job.lease))return send(409,{code:'CHAT_UI_JOB_EXPIRED'});
        if(typeof body.path!=='string'||body.path.length>2048||!path.isAbsolute(body.path))return send(400,{code:'CHAT_UI_OUTPUT_REJECTED'});
        const real=await fs.promises.realpath(body.path),root=await fs.promises.realpath(path.join(DOWNLOAD_ROOT,'YuzuChatWork',job.id));if(!real.toLowerCase().startsWith(root.toLowerCase()+path.sep.toLowerCase()))return send(403,{code:'CHAT_UI_OUTPUT_REJECTED'});
        const stat=await fs.promises.stat(real),name=safeName(body.name||path.basename(real)),ext=path.extname(name).toLowerCase();if(!stat.isFile()||stat.size>24*1024*1024||stat.mtimeMs<job.createdAt-5000||!SAFE_EXT.has(ext))return send(400,{code:'CHAT_UI_OUTPUT_REJECTED'});
        const folder=path.join(workDirectory(),job.id);await fs.promises.mkdir(folder,{recursive:true});const destination=path.join(folder,name);await fs.promises.copyFile(real,destination);job.outputs.push({path:destination,name});return send(200,{ok:true,name});
      }
      if(allowedExtension&&request.method==='POST'&&request.url==='/complete'){
        const body=await readBody(request),job=active.get(body.id);if(!job||!job.claimed||!equal(body.lease,job.lease))return send(409,{code:'CHAT_UI_JOB_EXPIRED'});
        if(body.error)finish(job,null,/^CHAT_UI_[A-Z_]+$/.test(body.error)?body.error:'CHAT_UI_PAGE_FAILED');
        else if(typeof body.text==='string'&&body.text.trim()&&body.text.length<=100000)finish(job,{text:body.text,outputs:job.outputs});
        else finish(job,null,'CHAT_UI_EMPTY_REPLY');return send(200,{ok:true});
      }
      if(owner&&request.method==='GET'&&request.url==='/status')return send(200,{paired:!!config.extensionId,...heartbeat});
      send(404,{code:'NOT_FOUND'});
    }catch{send(400,{code:'CHAT_UI_INVALID_INPUT'});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  atomicJson(path.join(directory,'server.private.json'),{pid:process.pid,script:process.argv[1],startedAt});
  const stop=()=>{for(const job of active.values())finish(job,null,'CHAT_UI_SHUTDOWN');server.closeAllConnections();server.close(()=>process.exit(0));};process.once('SIGTERM',stop);process.once('SIGINT',stop);
  return server;
}
