import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Context} from '../runtime/node_modules/@deepseek-ai/cordis/lib/index.js';
import {AgentRegistry} from '../runtime/node_modules/@deepseek-ai/dsh-agent/lib/index.js';
import {AgentLoop} from '../runtime/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js';
import {SessionStore} from '../runtime/node_modules/@deepseek-ai/dsh-session/lib/index.js';
import {SessionProjectionRegistry} from '../runtime/node_modules/@deepseek-ai/dsh-session-projection/lib/index.js';
import {SystemPrompt} from '../runtime/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js';
import {LlmRuntime,LlmAdapter,createUserMessage} from '../runtime/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import {ToolRuntime,defineTool} from '../runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
import {installQQToolEvidence,toolEvidencePrompt} from '../dsh-hymemory-plugin/tool-evidence.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-native-tool-evidence-'));
process.env.QQBOT_METRICS_DIR=root;
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-native-tool-evidence-/);fs.rmSync(root,{recursive:true,force:true});});
const IDENTITY=Symbol.for('qqbot.identity'),EVIDENCE=Symbol.for('qqbot.evidence');
test('actual native tool runtime credits successful search to this turn and updates the next prompt',async()=>{
 const ctx=new Context();new SessionProjectionRegistry(ctx);new SessionStore(ctx);new AgentRegistry(ctx);new SystemPrompt(ctx,{includeHarnessIdentity:false});new ToolRuntime(ctx);new LlmRuntime(ctx);
 let calls=0;const prompts=[];
 class Synthetic extends LlmAdapter{async *stream(request){calls++;prompts.push(JSON.stringify(request.messages));if(calls===1)yield {type:'tool-call-delta',index:0,id:'search-1',name:'web_search',argumentsDelta:'{}'};else yield {type:'text-delta',index:0,text:'已完成查询'};yield {type:'finish',reason:{kind:calls===1?'tool-calls':'stop'}};}}
 ctx.llm.registerAdapter(['synthetic'],new Synthetic());new AgentLoop(ctx,{agents:[],maxParallelToolCalls:{get:()=>2}});
 installQQToolEvidence(ctx);installQQToolEvidence(ctx);
 ctx.tools.register(defineTool({name:'web_search',description:'synthetic search',parameters:{},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async()=> 'Synthetic public evidence'}));
 const handle=await ctx.agents.create({sessionId:crypto.randomUUID(),agentOptions:{provider:'synthetic',model:'fixture'}}),agent=handle.agent;
 agent[IDENTITY]={appId:'native-evidence',scope:'group',peerId:'synthetic-room',senderId:'synthetic-person'};agent[EVIDENCE]={kind:'agent'};
 try{agent.followup(createUserMessage({content:[{type:'text',text:'公开合成查询'}],source:{kind:'user'}}));await agent.whenIdle();assert.equal(calls,2);assert.deepEqual(agent[EVIDENCE].webEvidence.search,{attempts:1,successes:1});assert.match(prompts[0],/当前搜索执行0次/);assert.match(prompts[1],/当前搜索执行1次/);}finally{await handle.dispose();}
});
test('a late tool result credits its captured turn rather than the next inbound',async()=>{
 let handler,finish;const ctx={on:(_name,fn)=>{handler=fn;},get:()=>({section:()=>{}})};installQQToolEvidence(ctx);
 const old={kind:'agent'},fresh={kind:'agent'},agent={[IDENTITY]:{},[EVIDENCE]:old};
 const pending=handler({name:'web_search',agent},()=>new Promise(resolve=>{finish=resolve;}));agent[EVIDENCE]=fresh;finish({isError:false});await pending;
 assert.equal(old.webEvidence.search.successes,1);assert.equal(fresh.webEvidence,undefined);assert.match(toolEvidencePrompt(fresh),/当前搜索执行0次/);
});
