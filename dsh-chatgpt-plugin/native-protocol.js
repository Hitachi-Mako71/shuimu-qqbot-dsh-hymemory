import {createHash} from 'node:crypto';
export const sessionKey = id => id ? createHash('sha256').update(String(id)).digest('hex').slice(0,24) : null;
export const blocks = message => typeof message.content === 'string' ? [{type:'text',text:message.content}] : message.content || [];
export const messageText = message => blocks(message).filter(b=>b.type==='text').map(b=>b.text).join('\n');
export function prepareInput(options) {
  const messages=options.messages||[], context=new Map();
  if(options.system)context.set('system',options.system);
  let lastAssistant=-1;
  for(let i=0;i<messages.length;i++) {
    const m=messages[i];if(m.role==='assistant')lastAssistant=i;
    if(m.role==='system'||m.role==='developer'||(m.role==='user'&&m.source&&m.source.kind!=='user'))
      context.set(m.source?.producer||m.source?.kind||m.role,messageText(m));
  }
  let current=messages.slice(lastAssistant+1).filter(m=>m.role==='user'&&(!m.source||m.source.kind==='user'));
  // The official QQ vision tool uses a plugin-sourced user message. It is
  // an independent model request, not a memory block in a persistent chat.
  if(!options.sessionId&&!current.length)current=messages.slice(lastAssistant+1).filter(m=>m.role==='user'
    &&m.source?.kind==='plugin'&&m.source?.plugin==='dsh-im-qqbot'&&blocks(m).some(b=>b.type==='image'&&!b.offloaded));
  const input=current.flatMap(m=>blocks(m).filter(b=>b.type==='text').map(b=>({type:'text',text:b.text})));
  return {input,current,context:[...context.values()].join('\n\n').slice(-48000)};
}
export function toolsForCodex(tools=[]) {
  const names=new Map();const specs=tools.map(t=>{
    const name='dsh_'+createHash('sha256').update(t.name).digest('hex').slice(0,20);names.set(name,t.name);
    return {type:'function',name,description:t.description||t.name,inputSchema:t.parameters||{type:'object',properties:{}}};
  });return{names,specs};
}
