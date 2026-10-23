import path from 'node:path';
import { ChatGPTAccount, authDirectory, atomicJson, readJson } from './auth.js';
const args = process.argv.slice(2);
const action = args[0] || 'status';
const at = args.indexOf('--directory');
const account = new ChatGPTAccount(at >= 0 ? path.resolve(args[at + 1]) : authDirectory());
try {
  if (action === 'login') {
    const models = await account.login();
    console.log(JSON.stringify({ connected: true, models: models.length }));
  } else if (action === 'status') console.log(JSON.stringify(account.status()));
  else if (action === 'models') console.log(JSON.stringify({ models: await account.models() }));
  else if (action === 'probe') {
    const modelAt = args.indexOf('--model'), models = readJson(path.join(account.directory, 'models.json'), { models: [] }).models;
    const model = modelAt >= 0 ? args[modelAt + 1] : models[0]?.id;
    if (!model || !models.some((m) => m.id === model)) throw new Error('SELECT_AVAILABLE_MODEL');
    const response = await account.api('/responses', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, instructions: '请只回复“连接成功”。', input: [{ role: 'user', content: '测试连接。' }], reasoning: { effort: 'low' }, store: false, stream: true }), signal: AbortSignal.timeout(60000) });
    const { readEvents } = await import('./protocol.js');
    let completed = false, text = '';
    for await (const event of readEvents(response.body)) {
      if (event.type === 'response.output_text.delta') text += event.delta || '';
      if (event.type === 'response.completed') completed = true;
      if (['response.failed', 'error', 'response.incomplete'].includes(event.type)) throw new Error('INFERENCE_FAILED');
    }
    if (!completed || !text.trim()) throw new Error('INFERENCE_NOT_COMPLETED');
    const result = { success: true, model, completedAt: Date.now(), textPresent: true };
    atomicJson(path.join(account.directory, 'probe.json'), result); account.setStatus('connected'); console.log(JSON.stringify(result));
  } else throw new Error('UNSUPPORTED_ACTION');
} catch (error) { console.log(JSON.stringify({ success: false, code: error.code || 'CHATGPT_UNAVAILABLE' })); process.exitCode = 1; }
