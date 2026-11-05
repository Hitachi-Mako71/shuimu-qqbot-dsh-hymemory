import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const moduleUrl=new URL('../dsh-hymemory-plugin/pdf-tools.js',import.meta.url);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-pdf-check-'));
Object.assign(process.env,{QQBOT_WORKSPACE_ROOT:path.join(root,'workspaces'),QQBOT_COMPANION_DIR:path.join(root,'companion'),QQBOT_PRIVACY_DIR:path.join(root,'privacy')});
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-pdf-check-/);fs.rmSync(root,{recursive:true,force:true});});
test('QQ has a bounded PDF text capability instead of requiring shell access',async()=>{
  assert.equal(fs.existsSync(moduleUrl),true,'PDF text tool is missing');
  const {extractPdfBytes}=await import(moduleUrl);
  const result=await extractPdfBytes(pdfFixture(['First page','Second page','Discussion and limitations']),{start_page:3,page_count:1});
  assert.equal(result.totalPages,3);
  assert.equal(result.pages[0].page,3);
  assert.match(result.pages[0].text,/Discussion and limitations/);
  assert.equal(result.hasMore,false);
});

test('PDF windows expose continuation, character truncation, missing text and argument failures',async()=>{
 const {extractPdfBytes}=await import(moduleUrl),bytes=pdfFixture(['A'.repeat(600),'Second','Last']);
 const first=await extractPdfBytes(bytes,{page_count:1});assert.equal(first.hasMore,true);assert.equal(first.nextPage,2);
 const clipped=await extractPdfBytes(bytes,{max_characters:256});assert.equal(clipped.truncated,true);assert.equal(clipped.pages[0].text.length,256);assert.equal(clipped.nextPage,1);
 const blank=await extractPdfBytes(pdfFixture(['']));assert.equal(blank.textAvailable,false);
 for(const args of [{start_page:0},{page_count:21},{max_characters:Infinity},{start_page:1.1}])await assert.rejects(extractPdfBytes(bytes,args),{code:'PDF_ARGUMENTS_INVALID'});
 await assert.rejects(extractPdfBytes(bytes,{start_page:4}),{code:'PDF_PAGE_OUT_OF_RANGE'});
 await assert.rejects(extractPdfBytes(Buffer.from('not pdf')),{code:'PDF_INVALID'});
 await assert.rejects(extractPdfBytes(Buffer.alloc(32*1024*1024+1)),{code:'PDF_TOO_LARGE'});
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(extractPdfBytes(bytes,{},cancelled.signal),{name:'AbortError'});
 const inFlight=new AbortController(),task=extractPdfBytes(bytes,{},inFlight.signal);inFlight.abort();await assert.rejects(task,{name:'AbortError'});
});

test('local PDF execution retains identity, workspace and historical read-only restrictions',async()=>{
 const {readQQPdf,installQQPdfTools}=await import(moduleUrl),{qqWorkspace,qqToolDenial}=await import('../dsh-hymemory-plugin/workspace.js');
 const identity={appId:'pdf-check',scope:'c2c',peerId:'person',senderId:'person'},workspace=qqWorkspace(identity);
 const target=path.join(workspace,'sample.pdf');fs.writeFileSync(target,pdfFixture(['Local PDF text']));
 const agent={[Symbol.for('qqbot.identity')]:identity,session:{},ctx:{get:()=>({get:()=>workspace})}};
 const exec={agent,name:'qqbot_read_pdf',arguments:{file_path:target},signal:new AbortController().signal};
 assert.equal(qqToolDenial(exec),undefined);assert.match((await readQQPdf(exec)).pages[0].text,/Local PDF text/);
 const outside={...exec,arguments:{file_path:path.join(root,'outside.pdf')}};assert.match(qqToolDenial(outside),/只能访问/);await assert.rejects(readQQPdf(outside),/QQPathRejected/);
 await assert.rejects(readQQPdf({...exec,agent:{...agent,[Symbol.for('qqbot.history.readonly')]:true}}),{code:'PDF_PERMISSION_DENIED'});
 await assert.rejects(readQQPdf({...exec,arguments:{file_path:target,url:'https://example.org/p.pdf'}}),{code:'PDF_ARGUMENTS_INVALID'});
 let registered;installQQPdfTools({get:name=>name==='tools'?{register:tool=>registered=tool}:{section(){}}});
 assert.equal(registered.name,'qqbot_read_pdf');const result=JSON.parse(await registered.execute({file_path:target},exec));assert.equal(result.totalPages,1);
});

test('public PDF adapter uses the pinned HTTP provider with redirects, byte cap and HTTP validation',async()=>{
 const {fetchPdfUrl}=await import(moduleUrl);
 const {HttpFetchProvider}=await import('file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-web-fetch-http/lib/index.js');
 const bytes=pdfFixture(['Public PDF text']);let closed=0,calls=0;
 const provider=new HttpFetchProvider({maxResponseBytes:4096,maxBodyChars:4096,timeoutMs:2000,maxRedirects:3,userAgent:'synthetic-pdf-check'});
 const nativeRequest=provider.requestOnce.bind(provider);
 provider.requestOnce=async(url,signal)=>{calls++;if(url.hostname==='127.0.0.1')return nativeRequest(url,signal);return {response:url.pathname==='/'?new Response('',{status:302,headers:{location:'https://other.example/paper.pdf'}}):new Response(bytes,{headers:{'content-type':'application/pdf'}}),close:async()=>{closed++;}};};
 const r=await fetchPdfUrl(provider,'https://example.org/');assert.equal(r.url,'https://other.example/paper.pdf');assert.match(r.pages[0].text,/Public PDF text/);assert.equal(calls,2);assert.equal(closed,2);
 provider.requestOnce=async()=>({response:new Response(bytes,{status:403,headers:{'content-type':'application/pdf'}}),close:async()=>{}});
 await assert.rejects(fetchPdfUrl(provider,'https://example.org/p.pdf'),{code:'PDF_HTTP_ERROR'});
 provider.requestOnce=async()=>({response:new Response('html',{headers:{'content-type':'text/html'}}),close:async()=>{}});
 await assert.rejects(fetchPdfUrl(provider,'https://example.org/p.pdf'),{code:'PDF_EXPECTED'});
 provider.limits.maxResponseBytes=10;
 provider.requestOnce=async()=>({response:new Response(bytes,{headers:{'content-type':'application/pdf'}}),close:async()=>{}});
 assert.match((await fetchPdfUrl(provider,'https://example.org/p.pdf')).pages[0].text,/Public PDF text/);
 assert.equal(provider.limits.maxResponseBytes,10,'PDF cap must not mutate the normal web provider');
 provider.requestOnce=async()=>({response:new Response(bytes,{headers:{'content-type':'application/pdf','content-length':String(33*1024*1024)}}),close:async()=>{}});
 await assert.rejects(fetchPdfUrl(provider,'https://example.org/p.pdf'),{code:'WEB_FETCH_TOO_LARGE'});
 provider.requestOnce=nativeRequest;await assert.rejects(fetchPdfUrl(provider,'https://127.0.0.1/p.pdf'),{code:'WEB_BLOCKED_URL'});
});

test('real DSH registry dispatches the PDF tool and validates its returned value',async()=>{
 const {Context}=await import('file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/cordis/lib/index.js');
 const {ToolRuntime}=await import('file:///D:/DeepSeekHarnessData/qqbot-hymemory/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js');
 const {installQQPdfTools}=await import(moduleUrl),{qqWorkspace,qqToolDenial}=await import('../dsh-hymemory-plugin/workspace.js');
 const identity={appId:'pdf-registry',scope:'c2c',peerId:'person',senderId:'person'},workspace=qqWorkspace(identity);
 const target=path.join(workspace,'registry.pdf');fs.writeFileSync(target,pdfFixture(['Registry PDF text']));
 const ctx=new Context();ctx.provide('systemPrompt',{tools(){},section(){},getSectionOrder(){return 486;}});ctx.provide('workingDirectory',{get:()=>workspace});
 const tools=new ToolRuntime(ctx);tools.guard(qqToolDenial);installQQPdfTools(ctx);
 const result=await tools.execute({callId:'synthetic-pdf-registry',name:'qqbot_read_pdf',arguments:{file_path:target},agent:{[Symbol.for('qqbot.identity')]:identity,ctx,session:{}},signal:new AbortController().signal});
 assert.equal(result.isError,false,JSON.stringify(result.error));assert.match(result.content[0].text,/Registry PDF text/);
});

export function pdfFixture(texts){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${texts.length} /Kids [${texts.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] >>`];
  for(const text of texts){const stream=`BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${objects.length+2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}
  let out='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(out);out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(x=>`${String(x).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}
