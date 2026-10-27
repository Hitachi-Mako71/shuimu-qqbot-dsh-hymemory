import path from 'node:path';
import { LlmAdapter, LlmError, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { ChatGPTAccount, authDirectory, readJson, APP_NAME } from './auth.js';
import { buildRequest, responseChunks } from './protocol.js';
import manifest from './package.json' with { type: 'json' };
import { ChatBrowserAdapter } from './chat-ui-adapter.js';
import { NativeCodexAdapter } from './native-adapter.js';
export const name = 'dsh-chatgpt-plan';
export const inject = ['llm'];
export class ChatGPTPlanAdapter extends LlmAdapter {
  constructor(ctx, account = new ChatGPTAccount()) { super(); this.ctx = ctx; this.account = account; }
  providerInfo(provider) { return { id: provider, name: 'ChatGPT 账号授权' }; }
  cachedModels() { return readJson(path.join(this.account.directory, 'models.json'), { models: [] }).models; }
  async listModels(provider) { return this.account.status().connected ? this.cachedModels().map((m) => ({ provider, id: m.id, name: m.name, inputModalities: m.inputModalities })) : []; }
  async resolveModel(provider, model) {
    const entry = this.cachedModels().find((m) => m.id === model);
    if (!entry) throw new LlmError('请先登录ChatGPT、刷新模型列表并选择可用模型。', 'MODEL_NOT_FOUND');
    return { provider, id: model, name: entry.name, inputModalities: entry.inputModalities,
      context: { contextWindow: entry.contextWindow }, reasoning: { efforts: [{ id: 'off', name: '模型默认' }], defaultEffort: 'off' } };
  }
  async *stream(options) {
    try {
      const entry = this.cachedModels().find((m) => m.id === options.model);
      const low = entry?.reasoning?.some((r) => (typeof r === 'string' ? r : r.effort) === 'low');
      const payload = await buildRequest({ ...options, ...(low ? { chatgptReasoning: 'low' } : {}) }, this.ctx.get('attachments'));
      const response = await this.account.api('/responses', { method: 'POST', headers: { ...attributionHeaders({ product: 'yuzu-qqbot', version: manifest.version, url: 'https://github.com/Hitachi-Mako71/shuimu-qqbot-dsh-hymemory' }), 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000) });
      yield* responseChunks(response.body, options.tools, options.model);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const code = error.code === 'RATE_LIMIT' ? 'RATE_LIMIT' : /LOGIN|AUTH|TOKEN|PERMISSION/.test(error.code || '') ? 'AUTH' : 'PROVIDER_ERROR';
      throw new LlmError(`ChatGPT账号请求未完成（${error.code || 'UNAVAILABLE'}），请查看控制台账号状态。`, code, Number.isInteger(error.status) ? { status: error.status } : undefined);
    }
  }
}
export function apply(ctx) { ctx.get('llm').registerAdapter(['chatgpt-plan'], new ChatGPTPlanAdapter(ctx)); ctx.get('llm').registerAdapter(['chatgpt-chat','chatgpt-chat-work'], new ChatBrowserAdapter(ctx)); ctx.get('llm').registerAdapter(['codex'], new NativeCodexAdapter(ctx)); }
