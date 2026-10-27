import {LlmAdapter,LlmError} from '@deepseek-ai/dsh-llm';
import path from 'node:path';
import {nativeDirectory,readJson} from './native-rpc.js';
import {NativeEngine} from './native-engine.js';
export class NativeCodexAdapter extends LlmAdapter {
  constructor(ctx){super();this.ctx=ctx;this.engine=new NativeEngine();ctx.on('dispose',()=>this.engine.close());}
  providerInfo(provider){return{id:provider,name:'Codex · 原生会话'};}
  async listModels(provider){return readJson(path.join(nativeDirectory(),'models.json'),{models:[]}).models.map(m=>({...m,provider,inputModalities:['text','image']}));}
  async resolveModel(provider,model){const m=(await this.listModels(provider)).find(m=>m.id===model);if(!m)throw new LlmError('请先在控制台刷新Codex模型。','MODEL_NOT_FOUND');return{...m,context:{contextWindow:128000},reasoning:{efforts:[{id:'off',name:'简短思考'}],defaultEffort:'off'}};}
  async *stream(options){try{yield* this.engine.stream(options,this.ctx.get('attachments'));}catch(e){if(options.signal?.aborted)throw e;throw new LlmError('Codex原生会话未完成（'+(/^[A-Z_]+$/.test(e.message)?e.message:'CODEX_UNAVAILABLE')+'），请查看控制台。','PROVIDER_ERROR');}}
}
