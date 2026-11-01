import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Context} from '../runtime/node_modules/@deepseek-ai/cordis/lib/index.js';
import {AgentRegistry} from '../runtime/node_modules/@deepseek-ai/dsh-agent/lib/index.js';
import {AgentLoop} from '../runtime/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js';
import {SessionStore} from '../runtime/node_modules/@deepseek-ai/dsh-session/lib/index.js';
import {SessionProjectionRegistry} from '../runtime/node_modules/@deepseek-ai/dsh-session-projection/lib/index.js';
import {SystemPrompt} from '../runtime/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js';
import {LlmRuntime,LlmAdapter,createUserMessage} from '../runtime/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import {ToolRuntime,defineTool} from '../runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
import {configureQQTurnBudget,qqTurnToolDenial} from '../dsh-hymemory-plugin/turn-budget.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-native-budget-test-'));
process.env.QQBOT_METRICS_DIR=root;
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-native-budget-test-/);fs.rmSync(root,{recursive:true,force:true});});

async function fixture(stream){
  const ctx=new Context();new SessionProjectionRegistry(ctx);new SessionStore(ctx);new AgentRegistry(ctx);
  new SystemPrompt(ctx,{includeHarnessIdentity:false});new ToolRuntime(ctx);new LlmRuntime(ctx);
  class Synthetic extends LlmAdapter{stream(options){return stream(options);}}
  ctx.llm.registerAdapter(['synthetic'],new Synthetic());
  new AgentLoop(ctx,{agents:[],maxParallelToolCalls:{get:()=>2}});
  const handle=await ctx.agents.create({sessionId:crypto.randomUUID(),agentOptions:{provider:'synthetic',model:'fixture'}});
  ctx.tools.guard(qqTurnToolDenial);
  return {ctx,handle,agent:handle.agent};
}

test('real native Agent loop stops an endless tool chain before a third model call', {timeout:5000},async()=>{
  let requests=0,tools=0;
  const f=await fixture(async function*(){requests++;yield {type:'tool-call-delta',index:0,id:'call-'+requests,name:'synthetic_read',argumentsDelta:'{}'};yield {type:'finish',reason:{kind:'tool-calls'}};});
  f.ctx.tools.register(defineTool({name:'synthetic_read',description:'Synthetic read only',parameters:{},
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    execute:async()=>{tools++;return 'read completed';}}));
  const budget=configureQQTurnBudget(f.agent,{maxModelRequests:2,maxMs:3000});
  try{
    f.agent.followup(createUserMessage({content:[{type:'text',text:'公开合成循环测试'}],source:{kind:'user'}}));
    await f.agent.whenIdle();assert.equal(requests,2);assert.equal(tools,2);
    assert.throws(()=>budget.assertDelivery(),/QQTurnLimit/);
  }finally{budget.finish();await f.handle.dispose();}
});

test('real native Agent deadline aborts its pending provider signal and settles whenIdle', {timeout:5000},async()=>{
  let stopped=false,started;
  const ready=new Promise(resolve=>started=resolve);
  const f=await fixture(async function*({signal}){started();await new Promise(resolve=>signal.addEventListener('abort',()=>{stopped=true;resolve();},{once:true}));yield {type:'finish',reason:{kind:'aborted'}};});
  const budget=configureQQTurnBudget(f.agent,{maxMs:80});
  try{
    f.agent.followup(createUserMessage({content:[{type:'text',text:'公开合成取消测试'}],source:{kind:'user'}}));
    await ready;await f.agent.whenIdle();assert.equal(stopped,true);assert.throws(()=>budget.assertDelivery(),/QQTurnLimit/);
  }finally{budget.finish();await f.handle.dispose();}
});

for(const mode of ['tool-count','repeated-failure'])test('native tool guard stops '+mode,{timeout:5000},async()=>{
  let requests=0,tools=0;
  const f=await fixture(async function*(){requests++;yield {type:'tool-call-delta',index:0,id:'call-'+requests,name:'synthetic_read',argumentsDelta:'{}'};yield {type:'finish',reason:{kind:'tool-calls'}};});
  f.ctx.tools.register(defineTool({name:'synthetic_read',description:'Synthetic read only',parameters:{},
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    execute:async()=>{tools++;if(mode==='repeated-failure')throw Error('same synthetic failure');return 'read completed';}}));
  const budget=configureQQTurnBudget(f.agent,{maxModelRequests:10,maxToolCalls:mode==='tool-count'?2:20,maxRepeatedFailures:2,maxMs:3000});
  try{
    f.agent.followup(createUserMessage({content:[{type:'text',text:'公开合成工具保护测试'}],source:{kind:'user'}}));
    await f.agent.whenIdle();assert.equal(tools,2);assert.equal(requests,mode==='tool-count'?3:2);
    assert.throws(()=>budget.assertDelivery(),/QQTurnLimit/);
  }finally{budget.finish();await f.handle.dispose();}
});
