// Delivery formatting for generated QQ prose. Tool/control output is left to
// its own renderer. Code fences remain literal, including internal blank lines.
const generated=new Set(['agent','group','background']);
const noAnalysis=/(?:别|不要|不用|无需|不必|禁止).{0,8}(?:分析|解释|复盘|诊断)/u;
const analysis=/(?:分析|解释|比较|对比|排查|诊断|为什么|什么原因|怎么(?:回事|解决|修复)|报错|故障|原因)/u;
const askLines=/(?:分行|逐行|列表|步骤|表格|代码|换行)/u;
const denyLines=/(?:别|不要|不用|无需|不必|禁止).{0,8}(?:分行|换行|列表|表格)/u;
const simple=/^(?:(?:柚柚|你)[，,\s]*)?(?:(?:又|还|咋|怎么|是不是)[，,\s]*){0,3}(?:死了|在吗|在不在|活着吗|没反应|卡了|回来了|我回来了|你好|早安|晚安|你在干嘛呢|在干嘛|你有点高冷|有点高冷|好|嗯|收到)[呀啊呢哦了，,。！？?!～~\s]*$/u;

function cutUnaskedTail(text,input){
  if(/(?:原样|逐字|一字不差|不改动|保持原文|保留原文|保留格式|保持格式|原文输出)/u.test(input))return text;
  if(analysis.test(input)&&!noAnalysis.test(input))return text;
  let value=text;
  if(simple.test(input.trim()))value=value.split(/\n/)[0];
  const boundaries=/(?:^|\n+|(?<=[。！？!?]))[ \t]*/gu;
  for(const match of value.matchAll(boundaries)){
    const index=match.index+match[0].length;
    if(!value.slice(0,index).trim())continue;
    const tail=value.slice(index);
    const diagnostic=/^(?:可能|估计|大概|也许)(?:又)?(?:是|只是|因为)?[^。！？!?\n]{0,65}(?:卡了|卡住|卡一下|没发出去|未发出|网络|系统|消息[^。！？!?\n]{0,10}没[^。！？!?\n]{0,6}发|延迟)/u.test(tail);
    const meta=/^(?:这里有(?:一?点|几点)值得注意[：:，,][^。！？!?\n]{0,12}(?:你|之前|刚才|其实)|我先(?:确认|分析|解释)一下(?:你的意思|你刚才)|(?:其实|也就是说)[，,:：\s]*(?:你(?:是|想|刚才)|这(?:说明|意味着)))/u.test(tail);
    const selfReview=/^(?:(?:我)?(?:刚才|刚刚|之前)|刚才是)[^。！？!?\n]{0,55}(?:话多|收了收|收过头|措辞|回复方式|控制语气|调整语气|调整表达)/u.test(tail);
    const followup=/^(?:今晚在忙什么|最近怎么样|想聊什么|要不要继续|你怎么看)[呀啊呢吗？?\s。]*$/u.test(tail.trim())&&!/(?:问我|找话题|主动聊|陪我聊|你来问)/u.test(input);
    if(diagnostic||meta||selfReview||followup)return value.slice(0,index).trimEnd();
  }
  return value;
}

function prose(text,input,{prune=true}={}){
  let value=text.replace(/<br\s*\/?\s*>/giu,'\n').replace(/^[ \t]*<qqbot:next-message\s*\/>[ \t]*$/gmu,'\n');
  if(prune)value=cutUnaskedTail(value,input);
  const lines=value.split('\n').map(s=>s.trim()).filter(Boolean);
  return lines.join((askLines.test(input)||/(?:原样|逐字|保留格式|保持格式)/u.test(input))&&!denyLines.test(input)?'\n':' ');
}

export function compactQQReply(text,context={}){
  if(typeof text!=='string'||!generated.has(context.kind))return text;
  const input=typeof context.replyInput==='string'?context.replyInput:'';
  const lines=text.replace(/\r\n?/gu,'\n').replace(/[\u2028\u2029]/gu,'\n').split('\n');
  const blocks=[];let pending=[],fence=null,code=[];
  const flush=()=>{const value=prose(pending.join('\n'),input,{prune:!fence});if(value)blocks.push(value);pending=[];};
  for(const line of lines){
    const marker=line.match(/^[ \t]{0,3}(`{3,}|~{3,})/u)?.[1];
    if(!fence&&marker){flush();fence=marker;code=[line];continue;}
    if(fence){
      code.push(line);
      if(marker&&marker[0]===fence[0]&&marker.length>=fence.length&&line.trim()===marker){blocks.push(code.join('\n'));fence=null;code=[];}
    }else pending.push(line);
  }
  if(fence)blocks.push(code.join('\n'));else flush();
  return blocks.join('\n');
}
