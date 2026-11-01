import test from 'node:test';import assert from 'node:assert/strict';
import {queryPolicy,WEB_QUERY_POLICY} from '../dsh-hymemory-plugin/query-policy.js';
import {historyPlan,historyTurn} from '../dsh-hymemory-plugin/history.js';
test('unknown player query and multi-field current identity request require public verification',()=>{
 for(const text of ['dolisu这个ID是什么游戏，是哪个国家、哪个战队的玩家','Faker现在在哪个战队？','以前Faker效力哪个战队？','今天成都天气怎么样','这个库最新版本是多少？'])assert.equal(queryPolicy(text).web,true,text);
});
test('explicit follow-up lookup resolves topic from context without asking search permission',()=>{
 for(const text of ['查一下','你查一下','帮我联网查一下','继续查','搜索 dolisu'])assert.equal(queryPolicy(text).web,true,text);
});
test('offline choice, local tasks, stable definitions and casual emotion stay local',()=>{
 for(const text of ['不要联网，dolisu是谁','翻译：搜索一下','帮我润色这段话','计算2+2','今天比赛输了好难过','今天天气真好想出去走走','什么是国籍','Java里怎么写循环','嗨，今天好累'])assert.equal(queryPolicy(text).web,false,text);
});
test('personal historical questions retain read-only conversation evidence route',()=>{
 for(const text of ['上次我们聊过哪个选手？','我之前说过喜欢什么游戏？','查原话：选手现在在哪个队','展开原话：sourceA'])assert.equal(queryPolicy(text).kind,'conversation-history',text);
 assert.ok(historyPlan('以前我们聊过什么'));assert.equal(historyPlan('查原话：以前Faker效力哪个战队？').explicit,true);
});
test('public historical or current questions are not mistaken for archive-only turns',async()=>{
 for(const input of ['以前Faker效力哪个战队？','上次说的dolisu现在在哪个队？','还记得Faker吗，他目前在哪个队？']){
  assert.equal(historyPlan(input),null,input);
  const r=await historyTurn({input,request:()=>{throw Error('must not enter history-only API');},base:{}});assert.equal(r,null);
 }
});
test('URL requests are public-page reads; old quoted URL discussion stays historical',()=>{
 assert.equal(queryPolicy('帮我看看https://example.org/roster').kind,'public-page');
 assert.equal(queryPolicy('查原话：https://example.org/roster').web,false);
});
test('policy explicitly covers complete fields, evidence quality, bounded fallback and identity ambiguity',()=>{
 for(const text of ['不先答不知道','全部字段','三个页面','国籍、赛区和居住地不同','当前战队与曾经战队','同名人物','明确要求不联网','不能假装查过'])assert.ok(WEB_QUERY_POLICY.includes(text),text);
});
