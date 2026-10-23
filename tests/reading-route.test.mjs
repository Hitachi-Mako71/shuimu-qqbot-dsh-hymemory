import test from 'node:test';
import assert from 'node:assert/strict';
import { readingContext, beforeReadingTurn } from '../dsh-hymemory-plugin/reading.js';
const identity={appId:'reader-fixture',scope:'c2c',peerId:'fixture-person'};
const key='qq-'+'a'.repeat(64);
const note={id:'Rfixture',book:'Bfixture',title:'合成书籍',author:'测试作者',pages:[3,4],summary:'角色仍在寻找答案。',reflection:'我想先保留这个疑问。',overview:'现在只读到开始，尚不知道后文。',evidence:[{page:3,quote:'他决定继续观察。'}],links:[],questions:['后文会改变这个判断吗？']};
async function fixture(run){
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,args)=>{calls.push({path:new URL(url).pathname,...JSON.parse(args.body)});return {ok:true,json:async()=>({ok:true,books:[{book:'Bfixture',title:'合成书籍',author:'测试作者',cursor:2,total:20,lastPage:4,overview:note.overview}],notes:[note]})};};
 try{await run(calls);}finally{globalThis.fetch=original;}
}
test('an elliptical followup receives compact latest reading evidence',async()=>fixture(async calls=>{
 const context=await readingContext(key,'那个人为什么这样做？');
 assert.ok(context.includes('合成书籍'));
 assert.ok(context.includes('继续观察'));
 assert.ok(context.length<3500);
 assert.equal(calls[0].limit,1);
}));
test('a real reading discussion bypasses fictional book recall',async()=>fixture(async()=>{
 const result=await beforeReadingTurn({identity,text:'这本书里哪句话你更喜欢？'});
 assert.equal(result.handled,false);
 assert.equal(result.readingAvailable,true);
 assert.ok(result.context.includes('合成书籍'));
}));
test('reading opinions are labeled as saved reader interpretations',async()=>fixture(async()=>{
 const result=await beforeReadingTurn({identity,text:'读书感悟'});
 assert.equal(result.handled,true);
 assert.ok(result.reply.includes('我想先保留这个疑问'));
 assert.ok(result.reply.includes('PDF第3—4页'));
}));
