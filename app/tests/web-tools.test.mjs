import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {fetchPublicRedirects,installQQWebTools} from '../dsh-hymemory-plugin/web-tools.js';
import {familyContext} from '../dsh-hymemory-plugin/family.js';import {write} from '../dsh-hymemory-plugin/companion-state.js';
import {HttpFetchProvider} from 'file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-web-fetch-http/lib/index.js';
import {Context} from 'file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/cordis/lib/index.js';
import {ToolRuntime} from 'file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
import {applyWebFetchTool} from 'file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-tool-web/lib/index.js';
import {WebRuntime} from 'file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-web/lib/index.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-web-test-'));Object.assign(process.env,{QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_PRIVACY_DIR:path.join(root,'privacy')});
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-web-test-/);fs.rmSync(root,{recursive:true,force:true});});
const limits={maxResponseBytes:4096,maxBodyChars:4096,timeoutMs:2000,maxRedirects:5,userAgent:'qq-web-synthetic-test'};
function fixture(routes,override={}){
 const p=new HttpFetchProvider({...limits,...override}),request=p.requestOnce.bind(p),calls=[],closed=[];
 p.requestOnce=async(url,signal)=>{calls.push(url.href);const route=routes[url.href];if(!route)return request(url,signal);return {response:typeof route==='function'?await route(signal):route(),close:async()=>{closed.push(url.href);}};};
 return {p,calls,closed};
}
const redirect=(location,status=302)=>()=>new Response('',{status,headers:{location}}),page=(body='合成公开原文',status=200)=>()=>new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8'}});
test('cross-origin redirect preserves its complete new path and query and closes both requests',async()=>{
 const f=fixture({'https://a.example.org/old':redirect('https://www.example.org/new?p=1'),'https://www.example.org/new?p=1':page()});const old=f.p.followAndRead;
 const r=await fetchPublicRedirects(f.p,'https://a.example.org/old');assert.equal(r.url,'https://www.example.org/new?p=1');assert.equal(r.body.content,'合成公开原文');assert.equal(r.statusCode,200);assert.equal(f.closed.length,2);assert.equal(f.p.followAndRead,old);
});
test('plain HTTP may upgrade to HTTPS',async()=>{const f=fixture({'http://example.org/':redirect('https://example.org/'),'https://example.org/':page()});assert.equal((await fetchPublicRedirects(f.p,'http://example.org/')).statusCode,200);});
test('HTTPS downgrade is refused before contacting the target',async()=>{const f=fixture({'https://example.org/':redirect('http://example.net/')});await assert.rejects(fetchPublicRedirects(f.p,'https://example.org/'),{code:'WEB_REDIRECT_BLOCKED'});assert.equal(f.calls.length,1);assert.equal(f.closed.length,1);});
test('redirect loops and hop caps terminate without unbounded requests',async()=>{
 const loop=fixture({'https://example.org/':redirect('https://other.org/'),'https://other.org/':redirect('https://example.org/')});await assert.rejects(fetchPublicRedirects(loop.p,'https://example.org/'),{code:'WEB_REDIRECT_BLOCKED'});assert.equal(loop.calls.length,2);
 const capped=fixture({'https://example.org/':redirect('/one'),'https://example.org/one':redirect('/two')},{maxRedirects:1});await assert.rejects(fetchPublicRedirects(capped.p,'https://example.org/'),{code:'WEB_REDIRECT_BLOCKED'});assert.equal(capped.calls.length,2);
});
test('redirects reject embedded credentials and non-HTTP schemes before a request',async()=>{
 for(const location of ['https://user:secret@example.net/','file:///C:/private.txt','data:text/plain,hello']){const f=fixture({'https://example.org/':redirect(location)});await assert.rejects(fetchPublicRedirects(f.p,'https://example.org/'),{code:'WEB_BLOCKED_URL'});assert.equal(f.calls.length,1);}
});
test('native public-address checks still block loopback, numeric loopback and metadata endpoints after redirect',async()=>{
 for(const target of ['https://127.0.0.1/','https://[::1]/','https://2130706433/','https://169.254.169.254/']){const f=fixture({'https://example.org/':redirect(target)});
  // Native IPv6 checks probe RFC7050 DNS64 before rejecting even ::1. Keep the
  // real resolver/address validator, replacing only external DNS discovery.
  const nativeResolve=f.p.resolveAddresses;
  f.p.resolveAddresses=(host,signal)=>nativeResolve(host,signal,async name=>{assert.equal(name,'ipv4only.arpa');return [{address:'192.0.0.170',family:4},{address:'192.0.0.171',family:4}];});
  await assert.rejects(fetchPublicRedirects(f.p,'https://example.org/'),{code:'WEB_BLOCKED_URL'});assert.equal(f.calls.length,2);assert.equal(f.closed.length,1);}
});
test('HTTP 403 is retained as unavailable content, never transformed into HTTP 200',async()=>{const f=fixture({'https://example.org/':page('Forbidden',403)});const r=await fetchPublicRedirects(f.p,'https://example.org/');assert.equal(r.statusCode,403);});
test('native character and byte caps remain active after redirects',async()=>{const f=fixture({'https://example.org/':redirect('/page'),'https://example.org/page':page('x'.repeat(512))},{maxBodyChars:20,maxResponseBytes:100});const r=await fetchPublicRedirects(f.p,'https://example.org/');assert.equal(r.body.content.length,20);assert.equal(r.truncated,true);});
test('caller cancellation and the native chain-wide deadline are preserved',async()=>{
 const a=new AbortController();a.abort();const f=fixture({});await assert.rejects(fetchPublicRedirects(f.p,'https://example.org/',a.signal));assert.equal(f.calls.length,0);
 const timeout=fixture({'https://example.org/':signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))},{timeoutMs:20});await assert.rejects(fetchPublicRedirects(timeout.p,'https://example.org/'));
});
function install(provider){let around,policy;const definition={output:{render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}],presentationMeta:(_a,v)=>({url:v.url,statusCode:v.statusCode})}};const providers=new Map([['http',provider]]);installQQWebTools({on:(name,fn)=>{if(name==='tools/execute')around=fn;},get:name=>name==='web'?{fetchProviders:providers}:name==='tools'?{get:()=>definition}:{section:s=>policy=s}});return {around,policy,providers};}
const actor={appId:'web-test',scope:'c2c',peerId:'owner',senderId:'owner'},agent={[Symbol.for('qqbot.identity')]:actor};
const failure={isError:true,error:{info:{name:'WebError',code:'WEB_REDIRECT_BLOCKED'},message:'redirect'},content:[{type:'text',text:'redirect failure'}]};
test('QQ around-dispatch replaces only a recoverable fetch failure with a canonical successful result',async()=>{
 const f=fixture({'https://example.org/':redirect('https://other.org/new'),'https://other.org/new':page()});const {around}=install(f.p);
 const r=await around({agent,name:'web_fetch',arguments:{url:'https://example.org/'},signal:new AbortController().signal},async()=>failure);
 assert.equal(r.isError,false);assert.equal(r.value.url,'https://other.org/new');assert.equal(r.meta.statusCode,200);assert.match(r.content[0].text,/合成公开原文/);
});
test('successful calls, other errors, other tools and non-QQ agents do not enter recovery',async()=>{
 const f=fixture({}),{around}=install(f.p),signal=new AbortController().signal;
 for(const [who,name,result] of [[{},'web_fetch',failure],[agent,'web_search',failure],[agent,'web_fetch',{...failure,error:{info:{code:'WEB_BLOCKED_URL'}}}],[agent,'web_fetch',{isError:false,value:'native'}]]){assert.equal(await around({agent:who,name,arguments:{url:'https://example.org/'},signal},async()=>result),result);}
 assert.equal(f.calls.length,0);
});
test('failed recovery remains an error and explains that the original page was not read',async()=>{const f=fixture({'https://example.org/':redirect('https://127.0.0.1/')});const {around}=install(f.p);const r=await around({agent,name:'web_fetch',arguments:{url:'https://example.org/'},signal:new AbortController().signal},async()=>failure);assert.equal(r.isError,true);assert.match(r.content[0].text,/未能读取原文/);assert.equal(r.value,undefined);});
test('history-only turns and ambiguous provider registries do not add external requests',async()=>{const f=fixture({}),{around,providers}=install(f.p),exec={agent:{...agent,[Symbol.for('qqbot.history.readonly')]:true},name:'web_fetch',arguments:{url:'https://example.org/'},signal:new AbortController().signal};assert.equal(await around(exec,async()=>failure),failure);providers.set('other',{});assert.equal(await around({...exec,agent},async()=>failure),failure);assert.equal(f.calls.length,0);});
test('family identity is retained while normal replies default to no repeated parent address',()=>{write('family.json',{schema:1,parents:[{role:'father',name:'爸爸甲',platformIds:['owner']}]});const t=familyContext(actor);assert.match(t,/爸爸甲/);assert.match(t,/普通回答默认不加/);assert.match(t,/不每条开头或结尾/);});
test('real DSH tool registry validates recovered value and renders it through the original web tool',async()=>{
 const ctx=new Context();ctx.provide('systemPrompt',{tools(){},section(){},getSectionOrder(){return 485;}});
 const f=fixture({'https://example.org/':redirect('https://other.org/new'),'https://other.org/new':page('<h1>原文标题</h1>')});
 const web=new WebRuntime(ctx,{fetchProvider:{get:()=> 'http'},searchProvider:{get:()=>undefined}});web.registerFetchProvider(f.p);web.registerFetchProvider({id:'remote-provider',available:()=>true,fetch:()=>{throw Error('configured HTTP selection must be respected');}});
 const tools=new ToolRuntime(ctx);applyWebFetchTool(ctx,30000,200000);installQQWebTools(ctx);
 const r=await tools.execute({callId:'synthetic-web-registry',name:'web_fetch',arguments:{url:'https://example.org/'},agent:{...agent,ctx},signal:new AbortController().signal});assert.equal(r.isError,false,JSON.stringify(r.error));assert.equal(r.value.statusCode,200);assert.equal(r.meta.url,'https://other.org/new');assert.match(r.content[0].text,/原文标题/);
});
