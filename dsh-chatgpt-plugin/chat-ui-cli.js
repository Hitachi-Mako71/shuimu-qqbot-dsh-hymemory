import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {serve,localRequest,uiDirectory} from './chat-ui-bridge.js';
import {atomicJson} from './auth.js';
import {buildWorkPrompt,parseChatReply} from './chat-ui-prompt.js';
const args=process.argv.slice(2),action=args[0],at=args.indexOf('--directory'),directory=at>=0?path.resolve(args[at+1]):uiDirectory();
try{
  if(action==='serve'){await serve(directory);console.log('Chat UI loopback bridge ready.');}
  else if(action==='pair'){
    const value={code:randomBytes(16).toString('hex'),expiresAt:Date.now()+15*60000};atomicJson(path.join(directory,'pairing.private.json'),value);console.log(JSON.stringify(value));
  }else if(action==='status')console.log(JSON.stringify(await localRequest('/status',undefined,{directory,signal:AbortSignal.timeout(5000)})));
  else if(action==='probe'){
    const request=await buildWorkPrompt({messages:[{role:'user',content:'请只回复“Chat工作通道连接成功”。'}]},null);
    const result=await localRequest('/generate',{purpose:'work',prompt:request.prompt,files:[],images:[]},{directory,signal:AbortSignal.timeout(155000)});const reply=parseChatReply(result.text,request.nonce);
    if(reply.kind!=='final'||!reply.text.includes('连接成功'))throw Error('CHAT_UI_PROBE_FAILED');
    const value={success:true,purpose:'work',model:'browser-chat',completedAt:Date.now(),textPresent:true};atomicJson(path.join(directory,'probe.json'),value);console.log(JSON.stringify(value));
  }else throw Error('UNSUPPORTED_ACTION');
}catch(error){console.log(JSON.stringify({success:false,code:/^[A-Z_]+$/.test(error.message)?error.message:'CHAT_UI_UNAVAILABLE'}));process.exitCode=1;}
