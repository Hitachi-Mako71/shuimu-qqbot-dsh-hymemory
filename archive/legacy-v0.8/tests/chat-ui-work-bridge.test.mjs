import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const root=path.resolve('github-repo/.tmp/chat-ui-work-bridge-'+randomUUID());
const userProfile=path.join(root,'user');
fs.mkdirSync(userProfile,{recursive:true});
process.env.USERPROFILE=userProfile;
process.env.QQBOT_CHAT_WORK_DIR=path.join(root,'workspace','chat-work-output');
const {serve,settings,localRequest}=await import('../dsh-chatgpt-plugin/chat-ui-bridge.js');
const directory=path.join(root,'bridge');fs.mkdirSync(directory,{recursive:true});
const config=settings(directory),extensionId='a'.repeat(32);config.extensionId=extensionId;
fs.writeFileSync(path.join(directory,'bridge.private.json'),JSON.stringify(config));
const server=await serve(directory,0),port=server.address().port;
const extensionHeaders={authorization:'Bearer '+config.extensionToken,'x-yuzu-extension':extensionId,'content-type':'application/json'};
async function extensionPost(route,body){const response=await fetch(`http://127.0.0.1:${port}${route}`,{method:'POST',headers:extensionHeaders,body:JSON.stringify(body)});return{status:response.status,value:await response.json()};}
try{
  let result=await extensionPost('/heartbeat',{ready:true,mode:'chat',work:true,temporary:false,status:'ready-work',extensionVersion:'0.2.0'});
  assert.equal(result.status,200);
  const pending=localRequest('/generate',{purpose:'work',prompt:'latest task only',files:[{name:'input.txt',type:'text/plain',data:Buffer.from('input').toString('base64')}],images:[]},{directory,port,signal:AbortSignal.timeout(10000)});
  let polled;
  for(let i=0;i<30&&!polled;i++){
    result=await extensionPost('/poll',{ready:true,mode:'chat',work:true,temporary:false,status:'ready-work',extensionVersion:'0.2.0'});
    polled=result.value.job;
    if(!polled)await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.ok(polled);
  assert.equal(polled.purpose,'work');
  assert.equal(polled.prompt,'latest task only');
  assert.equal(polled.files[0].name,'input.txt');

  const download=path.join(userProfile,'Downloads','YuzuChatWork',polled.id);fs.mkdirSync(download,{recursive:true});
  const incoming=path.join(download,'result.txt');fs.writeFileSync(incoming,'generated output');
  result=await extensionPost('/download',{id:polled.id,lease:polled.lease,path:incoming,name:'result.txt'});
  assert.equal(result.status,200);
  const delivered=await extensionPost('/complete',{id:polled.id,lease:polled.lease,text:'{"kind":"final"}'});
  assert.equal(delivered.status,200);
  const response=await pending;
  assert.equal(response.text,'{"kind":"final"}');
  assert.equal(response.outputs.length,1);
  assert.equal(fs.readFileSync(response.outputs[0].path,'utf8'),'generated output');
  assert.ok(response.outputs[0].path.startsWith(process.env.QQBOT_CHAT_WORK_DIR));
  console.log(JSON.stringify({passed:true,checks:10,workQueue:true,inputAttachment:true,generatedFileCopied:true}));
}finally{
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});
}
