import {randomUUID} from 'node:crypto';
import {LlmAdapter,LlmError} from '@deepseek-ai/dsh-llm';
import {localRequest} from './chat-ui-bridge.js';
import {buildChatPrompt,buildWorkPrompt,parseChatReply} from './chat-ui-prompt.js';
export class ChatBrowserAdapter extends LlmAdapter {
  constructor(ctx){super();this.ctx=ctx;}
  providerInfo(provider){return{id:provider,name:'ChatGPT Chat · 独立工作通道'};}
  async listModels(provider){return[{provider,id:'browser-chat',name:'专用Chat工作页当前模型',inputModalities:['text','image']}];}
  async resolveModel(provider,model){if(model!=='browser-chat')throw new LlmError('请使用专用Chat工作标签页当前选择的模型。','MODEL_NOT_FOUND');return{provider,id:model,name:'ChatGPT Chat · 工作页当前模型',inputModalities:['text','image'],context:{contextWindow:32768},reasoning:{efforts:[{id:'off',name:'Chat页面设置'}],defaultEffort:'off'}};}
  async *stream(options){
    try{
      const work=options.provider==='chatgpt-chat-work';
      const request=work?await buildWorkPrompt(options,this.ctx.get('attachments')):await buildChatPrompt(options,this.ctx.get('attachments'));
      const response=await localRequest('/generate',{purpose:work?'work':'legacy',prompt:request.prompt,files:work?request.files:[],images:request.images||[]},{signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(155000)]):AbortSignal.timeout(155000)});
      const reply=parseChatReply(response.text,request.nonce,options.tools||[]);
      if(work&&reply.kind!=='final')throw Error('CHAT_UI_TOOL_REJECTED');
      if(reply.kind==='final'){
        const sender=(options.tools||[]).find(t=>t.name==='qqbot_send_file');
        const outputPaths=response.outputs||[];
        const finalText=work&&reply.files?.length&&!outputPaths.length?reply.text+'\n\n文件生成成功，但没有检测到可回传的下载文件；请检查 Chat 工作页中的文件链接，或让她重新附上文件。':reply.text;
        let index=0;yield{type:'block-start',index,blockType:'text'};yield{type:'text-delta',index,text:finalText};yield{type:'block-end',index,block:{type:'text',text:finalText}};index++;
        for(const file of outputPaths){if(!sender)continue;yield{type:'block-start',index,blockType:'tool-call'};yield{type:'block-end',index,block:{type:'tool-call',id:randomUUID(),name:sender.name,arguments:JSON.stringify({file_path:file.path})}};index++;}
        yield{type:'finish',reason:{kind:index>1?'tool-calls':'stop'}};
      }
      else{let index=0;for(const call of reply.calls){yield{type:'block-start',index,blockType:'tool-call'};yield{type:'block-end',index,block:{type:'tool-call',...call}};index++;}yield{type:'finish',reason:{kind:'tool-calls'}};}
    }catch(error){if(options.signal?.aborted)throw error;const code=/^CHAT_UI_[A-Z_]+$/.test(error.message)?error.message:'CHAT_UI_REPLY_INVALID';throw new LlmError('Chat网页连接未完成（'+code+'），请查看控制台的Chat页面状态。','PROVIDER_ERROR');}
  }
}
