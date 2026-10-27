import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MEDIA_ROOT=path.resolve(process.env.USERPROFILE||process.env.HOME||'.','.dsh-qqbot','media');
const ALLOWED_EXTENSIONS=new Set(['.png','.jpg','.jpeg','.webp','.gif','.pdf','.txt','.md','.csv','.json','.py','.js','.ts','.html','.css','.docx','.xlsx','.pptx','.zip']);
const MIME_BY_EXT={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf','.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.json':'application/json','.py':'text/x-python','.js':'text/javascript','.ts':'text/plain','.html':'text/html','.css':'text/css','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.zip':'application/zip'};

function latestUser(options){return [...(options.messages||[])].reverse().find(m=>m.role==='user');}
function blocksOf(message){return typeof message?.content==='string'?[{type:'text',text:message.content}]:message?.content||[];}
function localMediaPaths(text){return [...String(text||'').matchAll(/(?:^|\n)\s*(?:Image|Video|File):\s*(.+?)\s*$/gim)].map(m=>m[1].replace(/^['"]|['"]$/g,''));}

export async function readWorkFiles(options,attachments){
  const message=latestUser(options);if(!message)throw Error('CHAT_UI_TASK_MISSING');
  const blocks=blocksOf(message),rawText=blocks.filter(b=>b.type==='text').map(b=>b.text||'').join('\n').trim();
  const text=rawText.replace(/(?:^|\n)\s*(?:Image|Video|File):\s*.+?(?=\n|$)/gim,'').trim();
  const files=[],seen=new Set();
  for(const block of blocks){
    if(block.type==='image'&&!block.offloaded){
      if(!attachments)throw Error('CHAT_UI_IMAGE_UNAVAILABLE');
      const image=await attachments.readImageRequest(block.attachment,{width:1536,height:1536,maxBytes:8*1024*1024},options.signal);
      const ext={ 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[image?.mediaType];if(!ext||!image?.data)throw Error('CHAT_UI_FILE_UNSUPPORTED');
      files.push({name:`qq-image-${files.length+1}${ext}`,type:image.mediaType,data:Buffer.from(image.data).toString('base64')});
    }
  }
  for(const raw of localMediaPaths(text)){
    const candidate=path.resolve(raw),ext=path.extname(candidate).toLowerCase();if(seen.has(candidate))continue;seen.add(candidate);
    if(!ALLOWED_EXTENSIONS.has(ext))throw Error('CHAT_UI_FILE_UNSUPPORTED');
    let real;try{real=await fs.realpath(candidate);}catch{throw Error('CHAT_UI_FILE_UNAVAILABLE');}
    if(!real.toLowerCase().startsWith((MEDIA_ROOT+path.sep).toLowerCase()))throw Error('CHAT_UI_FILE_REJECTED');
    const link=await fs.lstat(candidate),stat=await fs.stat(real);if(link.isSymbolicLink())throw Error('CHAT_UI_FILE_REJECTED');if(!stat.isFile()||stat.size>12*1024*1024)throw Error('CHAT_UI_FILE_TOO_LARGE');
    files.push({name:path.basename(real).replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(-100),type:MIME_BY_EXT[ext],data:(await fs.readFile(real)).toString('base64')});
  }
  if(files.length>6||files.reduce((n,f)=>n+Buffer.byteLength(f.data,'base64'),0)>24*1024*1024)throw Error('CHAT_UI_FILE_TOO_LARGE');
  return {task:text||'[用户只发送了附件，请检查附件并完成适当的工作。]',files};
}

export async function buildWorkPrompt(options,attachments){
  const nonce=randomUUID(),{task,files}=await readWorkFiles(options,attachments);
  const prompt='你正在处理一项来自QQ的独立工作任务。只根据本消息的task和files工作，不引用其他QQ对话、柚柚人设、长期记忆或此前任务。不要猜测缺失背景；需要澄清时直接说明。'
    +'附件已作为本次用户消息上传。若任务需要创建可交付文件，请通过Chat界面生成文件附件，并在最终JSON的files中列出附件显示的原始文件名；仅列出确实生成的文件，不要伪造路径或链接。'
    +'最终仅输出一个JSON对象，不要Markdown围栏：{"nonce":"'+nonce+'","kind":"final","text":"给用户的简洁说明","files":["实际生成的文件名"]}。不需要文件时files为空数组。\n'
    +JSON.stringify({task,files:files.map(({name,type})=>({name,type}))});
  return{nonce,prompt,files};
}

export async function buildChatPrompt(options, attachments) {
  const nonce=randomUUID(),history=[],images=[],pendingImages=new Map(),system=options.system?[options.system]:[];
  for(const message of options.messages||[]){
    const blocks=typeof message.content==='string'?[{type:'text',text:message.content}]:message.content||[],content=[],pending=[];
    for(const block of blocks){
      if(block.type==='text')content.push({type:'text',text:block.text});
      else if(block.type==='tool-call')content.push({type:'tool-call',id:block.id,name:block.name,arguments:block.arguments});
      else if(block.type==='image'&&!block.offloaded){
        const placeholder={type:'text',text:'[本轮附图]'};content.push(placeholder);pending.push({placeholder,attachment:block.attachment});
      }else if(block.type==='file')content.push({type:'text',text:'[本地文件需使用DSH文件工具读取]'});
    }
    if(message.role==='system')system.push(content.map(b=>b.text||'').join('\n'));
    else{const row={role:message.role,...(message.role==='tool'?{callId:message.source?.callId||message.callId}:{}),content};history.push(row);pendingImages.set(row,pending);}
  }
  const tools=(options.tools||[]).map(t=>({name:t.name,description:t.description||'',parameters:t.parameters||{type:'object',properties:{}}}));
  const prefix='你正在普通Chat对话中为用户的QQ助手提供回答。当前临时Chat不保存跨身份上下文；只使用本次提供的上下文，不从账户其他会话推断信息。保持Chat模式。\n'
    +'下面的system是用户为助手设定的人格与任务规则；history是按角色排列的真实对话和DSH工具结果。工具由用户本机的DSH执行，不是你网页里的插件。只有tools列出的工具可调用。不要谎称工具已运行。\n'
    +'最终仅输出一个JSON对象，不要Markdown围栏或解释：要回复用户时输出 {"nonce":"'+nonce+'","kind":"final","text":"回复正文"}；需要DSH执行工具时输出 {"nonce":"'+nonce+'","kind":"tools","calls":[{"name":"精确工具名","arguments":{}}]}。收到工具结果后再继续回答。没有tools时必须直接final。\n'
    +'contextWindow标注本次未提供的旧消息数量；原始历史仍保存在DSH。不要把省略部分当作已知，长期记忆以本次提供的资料为准。\n';
  const groups=[];
  for(let i=0;i<history.length;i++){
    if(!groups.length||(history[i].role==='user'&&history[i-1]?.role!=='user'))groups.push([]);
    groups.at(-1).push(history[i]);
  }
  let selected=history,omitted=0;
  const render=()=>prefix+JSON.stringify({system,history:selected,tools,contextWindow:{omittedMessages:omitted,persistedHistoryUnchanged:true}});
  while(render().length>99000&&groups.length>1){omitted+=groups.shift().length;selected=groups.flat();}
  if(render().length>99000)throw Error('CHAT_UI_CONTEXT_TOO_LARGE');
  for(const row of selected)for(const pending of pendingImages.get(row)||[]){
    if(!attachments)throw Error('CHAT_UI_IMAGE_UNAVAILABLE');
    const image=await attachments.readImageRequest(pending.attachment,{width:1536,height:1536,maxBytes:4*1024*1024},options.signal);
    if(!image?.data||!/^image\/(png|jpeg|webp)$/.test(image.mediaType))throw Error('CHAT_UI_IMAGE_UNSUPPORTED');
    images.push({type:image.mediaType,data:Buffer.from(image.data).toString('base64')});pending.placeholder.text=`[本轮附图${images.length}]`;
  }
  const prompt=render();
  if(prompt.length>100000||images.length>6)throw Error('CHAT_UI_CONTEXT_TOO_LARGE');return{nonce,prompt,images};
}
export function parseChatReply(text,nonce,tools=[]) {
  const value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(value.nonce!==nonce)throw Error('CHAT_UI_REPLY_MISMATCH');
  if(value.kind==='final'&&typeof value.text==='string'&&value.text.trim())return{kind:'final',text:value.text,files:Array.isArray(value.files)?value.files.filter(x=>typeof x==='string').slice(0,8):[]};
  if(value.kind!=='tools'||!Array.isArray(value.calls)||!value.calls.length||value.calls.length>8)throw Error('CHAT_UI_REPLY_INVALID');
  const names=new Set(tools.map(t=>t.name));return{kind:'tools',calls:value.calls.map(c=>{
    if(!names.has(c.name)||!c.arguments||Array.isArray(c.arguments)||typeof c.arguments!=='object')throw Error('CHAT_UI_TOOL_REJECTED');
    return{id:randomUUID(),name:c.name,arguments:JSON.stringify(c.arguments)};
  })};
}
