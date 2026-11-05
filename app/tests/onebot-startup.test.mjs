import test from 'node:test';
import assert from 'node:assert/strict';
import {OneBotConnection} from '../dsh-hymemory-plugin/onebot.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const config={selfId:'90001',url:'ws://127.0.0.1:3001',token:'synthetic-token'};
const packet=(id=1)=>({post_type:'message',self_id:90001,message_type:'group',group_id:90003,user_id:90002,message_id:id,message:[{type:'text',data:{text:'仔细看看呢'}}]});
class ManualSocket extends EventTarget{
 static sockets=[];
 constructor(){super();this.readyState=0;this.requests=[];ManualSocket.sockets.push(this);}
 open(){this.readyState=1;this.dispatchEvent(new Event('open'));}
 send(text){this.requests.push(JSON.parse(text));}
 packet(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
 login(id=90001){const request=this.requests.find(r=>r.action==='get_login_info');this.packet({echo:request.echo,status:'ok',retcode:0,data:{user_id:id}});}
 close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
}
function fixture(options={}){
 const received=[],states=[];
 const connection=new OneBotConnection(config,{WebSocketClass:ManualSocket,onMessage:async e=>received.push(e.message_id),status:s=>states.push(s),...options});
 const running=connection.start(),socket=ManualSocket.sockets.at(-1);socket.open();
 return {connection,socket,received,states,stop:async()=>{connection.stop();await running;}};
}

test('messages arriving before login verification are delivered once after readiness',async()=>{
 const f=fixture();try{f.socket.packet(packet(1));assert.deepEqual(f.received,[]);f.socket.login();await tick();assert.deepEqual(f.received,[1]);}finally{await f.stop();}
});
test('messages stay buffered while the application ready callback is pending',async()=>{
 let ready;const f=fixture({onReady:()=>new Promise(resolve=>{ready=resolve;})});
 try{f.socket.login();await tick();f.socket.packet(packet(2));assert.deepEqual(f.received,[]);ready();await tick();assert.deepEqual(f.received,[2]);}finally{await f.stop();}
});
test('wrong identity and stop during readiness never release queued user data',async()=>{
 const wrong=fixture();try{wrong.socket.packet(packet());wrong.socket.login(99999);await tick();assert.deepEqual(wrong.received,[]);assert.ok(wrong.states.includes('wrong_account'));}finally{await wrong.stop();}
 let ready;const stopped=fixture({onReady:()=>new Promise(resolve=>{ready=resolve;})});
 stopped.socket.packet(packet(3));stopped.socket.login();await tick();await stopped.stop();ready();await tick();assert.deepEqual(stopped.received,[]);
});
test('startup buffers have count, byte and age bounds',async()=>{
 const saved=Date.now;let now=saved();Date.now=()=>now;
 const f=fixture();try{for(let i=0;i<40;i++)f.socket.packet(packet(i));f.socket.packet({...packet(41),message:[{type:'text',data:{text:'x'.repeat(1024*1024)}}]});f.socket.login();await tick();assert.equal(f.received.length,32);assert.ok(f.states.includes('message_buffer_full'));}finally{await f.stop();Date.now=saved;}
 const expiring=fixture();try{Date.now=()=>now;expiring.socket.packet(packet(42));now+=30001;expiring.socket.login();await tick();assert.deepEqual(expiring.received,[]);assert.ok(expiring.states.includes('message_buffer_expired'));}finally{await expiring.stop();Date.now=saved;}
});
test('reconnect discards unverified old-socket data and old ready completions',async()=>{
 let firstReady;const f=fixture({onReady:()=>new Promise(resolve=>{firstReady=resolve;})});
 try{
  f.socket.packet(packet(5));f.socket.login();await tick();f.socket.close();clearTimeout(f.connection.timer);
  f.connection.onReady=async()=>{};f.connection.connect();const next=ManualSocket.sockets.at(-1);next.open();next.packet(packet(6));next.login();await tick();firstReady();await tick();assert.deepEqual(f.received,[6]);
 }finally{await f.stop();}
});
