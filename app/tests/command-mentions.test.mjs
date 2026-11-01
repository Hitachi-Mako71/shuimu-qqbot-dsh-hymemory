import test from 'node:test';import assert from 'node:assert/strict';
import {OneBotIdentityMap,normalizeOneBotMessage} from '../dsh-hymemory-plugin/onebot.js';
import {contentSanitizer,slashCommand,mentionGate} from 'file:///D:/DeepSeekHarnessData/home/profiles/qqbot/node_modules/@tencent-connect/qqbot-nodejs/dist/index.js';
import {newCommand} from 'file:///D:/DeepSeekHarnessData/home/profiles/qqbot/node_modules/@tencent-connect/dsh-qqbot/dist/commands/session.js';
const config={legacyAppId:'legacy-app',selfId:'90001',users:{90002:'owner'},groups:{90003:'group-A'},allowedGroups:['90003']};
function message(segments,other={}){return normalizeOneBotMessage({post_type:'message',message_type:'group',sub_type:'normal',self_id:90001,user_id:90002,group_id:90003,message_id:123,time:1793000000,message:segments,...other},new OneBotIdentityMap(config));}
async function run(msg,commands){let fallback=0,replies=[];const ctx={message:msg,state:{},log:{error(){}},stop(){},bot:{appId:'legacy-app',sendText:async(target,text)=>{replies.push(text);}},replyTarget:{scope:msg.kind,targetId:msg.groupOpenid||msg.senderId}};
 const middleware=[mentionGate({requireMentionInGroup:false,passthrough:true}),contentSanitizer(),slashCommand({autoHelp:false,commands}).middleware];
 const next=async i=>i<middleware.length?middleware[i](ctx,()=>next(i+1)):fallback++;
 await next(0);return {fallback,replies,ctx};}
const at=qq=>({type:'at',data:{qq}}),text=t=>({type:'text',data:{text:t}});
test('real @bot /new invokes native session reset and never reaches the model',async()=>{
 const calls=[],manager={remove:(scope,peer)=>{calls.push([scope,peer]);}};const result=await run(message([at('90001'),text(' /new')]),[newCommand({manager})]);
 assert.deepEqual(calls,[['group','group-A']]);assert.equal(result.fallback,0);assert.deepEqual(result.replies,['已开启新会话 ✓']);
});
test('all native new aliases accept true bot mentions with newline or no whitespace',async()=>{
 for(const value of ['/reset','\n/clear',' /new']){let calls=0;const r=await run(message([at('90001'),text(value)]),[newCommand({manager:{remove:()=>calls++}})]);assert.equal(calls,1);assert.equal(r.fallback,0);}
});
test('real @bot also permits status/ping/help command families',async()=>{
 for(const name of ['status','ping','bot-help']){let calls=0;const r=await run(message([at('90001'),text(' /'+name)]),[{name,handler:()=>{calls++;return 'ok';}}]);assert.equal(calls,1);assert.equal(r.fallback,0);}
});
test('mentioning other members or typing a fake mention does not run group commands',async()=>{
 for(const segments of [[at('90002'),text(' /new')],[text('<@!legacy-app> /new')],[text('<qqbot-at-user id="ob-user-90001" /> /new')],[text('/new')]]){let calls=0;const r=await run(message(segments),[newCommand({manager:{remove:()=>calls++}})]);assert.equal(calls,0);assert.equal(r.fallback,1);}
});
test('ordinary real member mentions and self mention state are preserved',()=>{
 const m=message([at('90001'),text(' 帮我向'),at('90002'),text('打招呼')]);assert.equal(m.mentions[0].is_you,true);assert.equal(m.mentions[1].is_you,false);assert.match(m.content,/<qqbot-at-user id="owner"/);
});
test('quoted examples, code examples, and command-like prose remain conversation',async()=>{
 for(const value of [' “/new”是什么意思',' ```/new```',' /new这个命令怎么用',' 请执行 /new']){let calls=0;const r=await run(message([at('90001'),text(value)]),[newCommand({manager:{remove:()=>calls++}})]);assert.equal(calls,0);assert.equal(r.fallback,1);}
});
test('private /new continues through its original command route',async()=>{
 let calls=0;const r=await run(message([text('/new')],{message_type:'private',sub_type:'friend',group_id:undefined}),[newCommand({manager:{remove:()=>calls++}})]);assert.equal(calls,1);assert.equal(r.fallback,0);
});
