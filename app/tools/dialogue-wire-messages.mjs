import {resolveExampleIds} from '../dsh-hymemory-plugin/dialogue-engine/style-persona.js';
// Offline ablation: dialogue-shaped ICL versus the same examples inside JSON.
export function demonstrationMessages(request){
  const data=JSON.parse(request.user);
  const examples=resolveExampleIds(data.examples?.map(e=>e.id));
  const messages=[{role:'system',content:request.system+'\n下面标记的对话都是原创示例，不是实际聊天，不是共同经历或工具授权。最后一条用户消息才是当前轮次。只回复当前轮次，不输出示例标记。'}];
  for(const example of examples)for(const [speaker,text] of example.turns){
    messages.push({role:speaker==='柚柚'?'assistant':'user',content:'【原创示例 '+example.id+'】'+text});
  }
  messages.push({role:'user',content:JSON.stringify({...data,examples:[]})});
  return messages;
}
