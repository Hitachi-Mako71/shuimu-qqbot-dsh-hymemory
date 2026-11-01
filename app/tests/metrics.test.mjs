import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as proxy from '../dsh-hymemory-plugin/model-proxy.js';
import * as plugin from '../dsh-hymemory-plugin/index.js';
import {Context} from '../runtime/node_modules/@deepseek-ai/cordis/lib/index.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-metrics-test-'));
process.env.QQBOT_METRICS_DIR=root;
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^qq-metrics-test-/);fs.rmSync(root,{recursive:true,force:true});});
test('OpenAI usage includes disjoint cached input once and preserves unknown measurements',()=>{
  assert.equal(typeof proxy.toOpenAIUsage,'function');
  assert.deepEqual(proxy.toOpenAIUsage({inputTokens:100,cacheReadTokens:400,cacheWriteTokens:20,outputTokens:30,totalTokens:550}),{
    prompt_tokens:520,completion_tokens:30,total_tokens:550,prompt_tokens_details:{cached_tokens:400}});
  assert.deepEqual(proxy.toOpenAIUsage({}),{});
});
test('LLM instrumentation preserves native chunks and records no prompt, reply or identity',async()=>{
  assert.equal(typeof plugin.installQQMetrics,'function');
  const ctx=new Context();plugin.installQQMetrics(ctx);
  const usage={type:'usage',usage:{inputTokens:10,cacheReadTokens:40,outputTokens:5}};
  const chunks=[{type:'text-delta',text:'private-output-secret'},usage];
  async function* provider(){yield* chunks;}
  const stream=ctx.waterfall(ctx,'llm/stream',{messages:[{content:[{type:'text',text:'private-prompt-secret'}]}]},()=>provider());
  const observed=[];for await(const chunk of stream)observed.push(chunk);
  assert.deepEqual(observed,chunks);
  const text=fs.readFileSync(path.join(root,'qq-runtime.jsonl'),'utf8');
  assert.doesNotMatch(text,/private-output-secret|private-prompt-secret|messages|identity|peerId/);
  const row=JSON.parse(text.trim().split('\n').at(-1));
  assert.equal(row.stage,'llm');assert.equal(row.inputTokens,10);assert.equal(row.cacheReadTokens,40);assert.equal(row.outputTokens,5);
});

test('native terminal errors are measured as failures even when the iterator does not throw',async()=>{
  const ctx=new Context();plugin.installQQMetrics(ctx);
  const chunk={type:'finish',reason:{kind:'error',failure:{code:'SYNTHETIC'}}};
  async function* provider(){yield chunk;}
  const stream=ctx.waterfall(ctx,'llm/stream',{messages:[]},()=>provider());
  for await(const value of stream)assert.equal(value,chunk);
  const rows=fs.readFileSync(path.join(root,'qq-runtime.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).status,'error');
});
