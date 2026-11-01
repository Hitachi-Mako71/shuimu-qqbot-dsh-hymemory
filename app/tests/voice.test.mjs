import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {VOICE_STYLE,SOCIAL_IMAGE_STYLE} from '../dsh-hymemory-plugin/voice.js';
import {DEFAULT_STYLE,EXAMPLES} from '../dsh-hymemory-plugin/dialogue-engine/style-persona.js';
import {apply} from '../dsh-hymemory-plugin/index.js';

test('registered voice is required for QQ only and preserves tool guards',async()=>{
 const sections=[],guards=[],handlers=[];
 const services={systemPrompt:{section:s=>sections.push(s),context:()=>{}},tools:{register:()=>{},guard:g=>guards.push(g)}};
 const ctx={get:n=>services[n],on:(...args)=>handlers.push(args),effect:async()=>{}};
 const oldToken=process.env.MEMORY_BRIDGE_TOKEN;process.env.MEMORY_BRIDGE_TOKEN='synthetic-voice-test';
 try{await apply(ctx);}finally{if(oldToken===undefined)delete process.env.MEMORY_BRIDGE_TOKEN;else process.env.MEMORY_BRIDGE_TOKEN=oldToken;}
 const section=sections.find(s=>s.name==='qqbot:voice');assert.ok(section?.required);
 assert.equal(section.text({agent:{}}),'');
 assert.equal(section.text({agent:{[Symbol.for('qqbot.identity')]:{scope:'group'}}}),VOICE_STYLE);
 assert.equal(section.text({agent:{[Symbol.for('qqbot.identity')]:{scope:'c2c'}}}),VOICE_STYLE);
 assert.ok(guards.length>=2);
});
test('voice delegates to engine and preserves identity, verified relations and example boundaries',()=>{
 assert.equal(VOICE_STYLE,DEFAULT_STYLE);
 for(const rule of [/端庄/,/不假装真人/,/不授予额外工具或记忆权限/,/示例不是发生过的事/])assert.match(VOICE_STYLE,rule);
 assert.ok(EXAMPLES.every(e=>e.origin==='authored'));
});
test('image policy distinguishes sharing from explicit inspection',()=>{
 for(const rule of [/明确问图片内容/,/表情图优先/,/实际图片/,/不能改变人设/,/不做摘要/,/不反问|不用问题/])assert.match(SOCIAL_IMAGE_STYLE,rule);
});
test('native and group adapters share the engine expression owner',()=>{
 const root=new URL('../dsh-hymemory-plugin/',import.meta.url);
 assert.match(fs.readFileSync(new URL('index.js',root),'utf8'),/VOICE_STYLE/);
 assert.match(fs.readFileSync(new URL('group-participation.js',root),'utf8'),/generateGroupDialogue/);
 assert.match(fs.readFileSync(new URL('dialogue-adapter.js',root),'utf8'),/generateDialogueReply/);
 assert.match(fs.readFileSync(new URL('qq-media.js',root),'utf8'),/SOCIAL_IMAGE_STYLE/);
});
