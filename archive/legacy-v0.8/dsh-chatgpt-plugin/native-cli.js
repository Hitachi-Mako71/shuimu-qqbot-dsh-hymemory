import path from 'node:path';
import {NativeRPC,nativeDirectory,writeJson,readJson} from './native-rpc.js';
import {NativeEngine} from './native-engine.js';
const argv=process.argv.slice(2),arg=(name,fallback)=>{const i=argv.indexOf(name);return i<0?fallback:argv[i+1];};
const directory=arg('--directory',nativeDirectory()),operation=argv[0]||'models',model=arg('--model','gpt-6-luna');
const rpc=new NativeRPC(directory);
try{
  await rpc.start();const account=await rpc.call('account/read',{});
  if(!account.account)throw Error('CODEX_LOGIN_REQUIRED');
  const available=await rpc.call('model/list',{});
  const models=available.data.filter(m=>/luna/.test(m.model||m.id)).map(m=>({id:m.model||m.id,name:m.displayName||m.model||m.id}));
  writeJson(path.join(directory,'models.json'),{models,updatedAt:Date.now()});
  writeJson(path.join(directory,'status.json'),{connected:true,accountType:account.account.type,updatedAt:Date.now()});
  if(operation==='probe'){
    if(!models.some(m=>m.id===model))throw Error('CODEX_MODEL_UNAVAILABLE');
    const engine=new NativeEngine(directory,rpc);let text='';
    for await(const part of engine.stream({model,messages:[{role:'user',content:'请只回复：原生连接成功。'}]}))if(part.type==='text-delta')text+=part.text;
    if(!text.includes('连接成功'))throw Error('CODEX_PROBE_REPLY_INVALID');
    writeJson(path.join(directory,'probe.json'),{success:true,model,updatedAt:Date.now()});
  }
  console.log(JSON.stringify({success:true,connected:true,models,operation,ownedThreads:Object.keys(readJson(path.join(directory,'threads.private.json'),{threads:{}}).threads).length}));
}catch(e){console.log(JSON.stringify({success:false,error:/^[A-Z_]+$/.test(e.message)?e.message:'CODEX_UNAVAILABLE'}));process.exitCode=1;}
finally{rpc.close();}
