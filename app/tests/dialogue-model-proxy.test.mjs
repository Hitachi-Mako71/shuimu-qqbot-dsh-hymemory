import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {startModelProxy} from '../dsh-hymemory-plugin/model-proxy.js';
test('offline proxy exposes per-request reasoning while default remains off and truncation remains visible',async()=>{
  const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const old={port:process.env.MEMORY_DSH_PORT,token:process.env.MEMORY_BRIDGE_TOKEN};
  process.env.MEMORY_DSH_PORT=String(port);process.env.MEMORY_BRIDGE_TOKEN='synthetic-eval-token';
  const requests=[];let cleanup,kind='stop';
  const ctx={get:()=>({async *stream(options){requests.push(options);yield {type:'text-delta',index:0,text:'测试正文'};yield {type:'finish',reason:{kind,...(kind==='error'?{failure:{code:'SYNTHETIC_FAILURE',message:'private-provider-detail'}}:{})}};}}),effect:async fn=>{cleanup=await fn();}};
  try{
    await startModelProxy(ctx);
    const send=body=>fetch('http://127.0.0.1:'+port+'/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer synthetic-eval-token','content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'合成测试'}],...body})});
    await (await send({})).json();assert.equal(requests.at(-1).reasoningEffort,'off');
    await (await send({reasoning_effort:'low'})).json();assert.equal(requests.at(-1).reasoningEffort,'low');
    await (await send({reasoning_effort:'high'})).json();assert.equal(requests.at(-1).reasoningEffort,'high');
    const n=requests.length;const bad=await send({reasoning_effort:'unknown'});assert.equal(bad.status,400);assert.equal(requests.length,n);
    kind='max-tokens';const bounded=await(await send({})).json();assert.equal(bounded.choices[0].finish_reason,'length');
    kind='error';const failed=await send({}),failure=await failed.json();assert.equal(failed.status,503);assert.equal(failure.error.code,'SYNTHETIC_FAILURE');assert.ok(!JSON.stringify(failure).includes('private-provider-detail'));
  }finally{
    cleanup?.();for(const [key,value] of [['MEMORY_DSH_PORT',old.port],['MEMORY_BRIDGE_TOKEN',old.token]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
