import { createHash } from 'node:crypto';
import { AccountError } from './auth.js';

export const wireName = (name) => /^[A-Za-z0-9_-]{1,64}$/.test(name) ? name : `${name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 45)}_${createHash('sha256').update(name).digest('hex').slice(0, 10)}`;
export async function buildRequest(options, attachments) {
  const input = [], instructions = options.system ? [options.system] : [];
  for (const message of options.messages || []) {
    const storedReplay = message.source?.replayState;
    const replay = storedReplay?.response || storedReplay;
    if (message.role === 'assistant' && message.source?.provider === 'chatgpt-plan' && message.source.model === options.model
        && replay?.format === 'chatgpt-plan-v1' && Array.isArray(replay.output)) { input.push(...replay.output); continue; }
    const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content || [];
    if (message.role === 'system') { instructions.push(blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n')); continue; }
    if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.source?.callId || message.callId,
        output: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '(empty tool result)' }); continue;
    }
    const role = ['user', 'assistant', 'developer'].includes(message.role) ? message.role : 'developer';
    let content = [];
    const flush = () => { if (content.length) input.push({ type: 'message', role, content }); content = []; };
    for (const block of blocks) {
      if (block.type === 'text') content.push({ type: role === 'assistant' ? 'output_text' : 'input_text', text: block.text });
      else if (block.type === 'tool-call') { flush(); input.push({ type: 'function_call', call_id: block.id, name: wireName(block.name), namespace: 'dsh', arguments: typeof block.arguments === 'string' ? block.arguments : JSON.stringify(block.arguments) }); }
      else if (block.type === 'image' && role !== 'assistant') {
        if (block.offloaded) content.push({ type: 'input_text', text: '[先前图片已从当前上下文卸载]' });
        else {
          if (!attachments) throw new AccountError('IMAGE_STORE_UNAVAILABLE');
          const image = await attachments.readImageRequest(block.attachment, { width: 1536, height: 1536, maxBytes: 5 * 1024 * 1024 }, options.signal);
          if (!image?.data || image.data.length > 8 * 1024 * 1024 || !/^image\/(png|jpeg|webp|gif)$/.test(image.mediaType)) throw new AccountError('IMAGE_REJECTED');
          content.push({ type: 'input_image', image_url: `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}` });
        }
      } else if (block.type === 'file') content.push({ type: 'input_text', text: `[本地附件：${String(block.attachment?.name || 'file').slice(0, 120)}]` });
    }
    flush();
  }
  const tools = options.tools?.map((tool) => ({ type: 'function', name: wireName(tool.name), description: tool.description || '', parameters: tool.parameters || { type: 'object', properties: {} }, strict: false }));
  // This is the ChatGPT plan contract, deliberately narrower than ordinary API calls.
  return { model: options.model, input, store: false, stream: true, include: ['reasoning.encrypted_content'],
    ...(options.chatgptReasoning ? { reasoning: { effort: options.chatgptReasoning } } : {}), ...(instructions.length ? { instructions: instructions.join('\n\n') } : {}),
    ...(tools?.length ? { tools: [{ type: 'namespace', name: 'dsh', description: 'Local tools supplied by the user’s QQ assistant.', tools }] } : {}) };
}
export async function* readEvents(body) {
  const decoder = new TextDecoder(); let buffered = '';
  const parse = (frame) => {
    const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return null;
    try { return JSON.parse(data); } catch { throw new AccountError('STREAM_JSON_INVALID'); }
  };
  for await (const bytes of body) {
    buffered = (buffered + decoder.decode(bytes, { stream: true })).replace(/\r\n/g, '\n');
    if (buffered.length > 8 * 1024 * 1024) throw new AccountError('STREAM_FRAME_TOO_LARGE');
    let end;
    while ((end = buffered.indexOf('\n\n')) >= 0) { const event = parse(buffered.slice(0, end)); buffered = buffered.slice(end + 2); if (event) yield event; }
  }
  buffered += decoder.decode();
  if (buffered.trim()) { const event = parse(buffered); if (event) yield event; }
}
export async function* responseChunks(body, tools = [], model = '') {
  const reverse = new Map(tools.map((t) => [wireName(t.name), t.name]));
  const blocks = new Map(), replayItems = new Map(); let next = 0, calls = false, completed = false;
  const textKey = (e) => `text:${e.item_id || e.output_index}:${e.content_index || 0}`;
  for await (const event of readEvents(body)) {
    if (event.type === 'response.output_item.done' && Number.isInteger(event.output_index) && event.item) replayItems.set(event.output_index, event.item);
    if (event.type === 'response.output_text.delta' || event.type === 'response.output_text.done') {
      const key = textKey(event); let block = blocks.get(key);
      if (!block) { block = { index: next++, type: 'text', text: '', ended: false }; blocks.set(key, block); yield { type: 'block-start', index: block.index, blockType: 'text' }; }
      if (event.type.endsWith('.delta')) { block.text += event.delta || ''; yield { type: 'text-delta', index: block.index, text: event.delta || '' }; }
      else if (!block.ended) { block.ended = true; if (!block.text && event.text) { block.text = event.text; yield { type: 'text-delta', index: block.index, text: block.text }; } yield { type: 'block-end', index: block.index, block: { type: 'text', text: block.text } }; }
    }
    if (['response.output_item.added', 'response.output_item.done'].includes(event.type) && event.item?.type === 'function_call') {
      const item = event.item, key = `call:${item.id || event.output_index}`; let block = blocks.get(key);
      if (!block) { block = { index: next++, type: 'tool-call', id: item.call_id, name: reverse.get(item.name) || item.name, arguments: '', ended: false }; blocks.set(key, block); calls = true; yield { type: 'block-start', index: block.index, blockType: 'tool-call' }; }
      if (event.type.endsWith('.done') && !block.ended) { block.ended = true; block.arguments = item.arguments || block.arguments || '{}'; yield { type: 'block-end', index: block.index, block: { type: 'tool-call', id: block.id, name: block.name, arguments: block.arguments } }; }
    }
    if (event.type === 'response.function_call_arguments.delta') {
      const block = blocks.get(`call:${event.item_id || event.output_index}`);
      if (block) { block.arguments += event.delta || ''; yield { type: 'tool-call-delta', index: block.index, id: block.id, name: block.name, argumentsDelta: event.delta || '' }; }
    }
    if (['response.failed', 'error'].includes(event.type)) throw new AccountError('INFERENCE_FAILED');
    if (event.type === 'response.incomplete') throw new AccountError('INFERENCE_INCOMPLETE');
    if (event.type === 'response.completed') {
      completed = true;
      for (const block of blocks.values()) if (!block.ended) { if (block.type === 'tool-call') throw new AccountError('TOOL_CALL_INCOMPLETE'); block.ended = true; yield { type: 'block-end', index: block.index, block: { type: 'text', text: block.text } }; }
      const usage = event.response?.usage || {}, cached = usage.input_tokens_details?.cached_tokens || 0;
      const output = Array.isArray(event.response?.output) ? [...event.response.output] : [];
      for (const [index, item] of replayItems) {
        if (!output[index] || (item.type === 'function_call' && output[index].type !== 'function_call')) output[index] = item;
      }
      while (output.length && output.at(-1) === undefined) output.pop();
      yield { type: 'usage', usage: { inputTokens: Math.max(0, (usage.input_tokens || 0) - cached), outputTokens: usage.output_tokens || 0, cacheReadTokens: cached,
        ...(Number.isFinite(usage.total_tokens) ? { totalTokens: usage.total_tokens } : {}), ...(Number.isFinite(usage.output_tokens_details?.reasoning_tokens) ? { reasoningTokens: usage.output_tokens_details.reasoning_tokens } : {}) } };
      yield { type: 'finish', reason: { kind: calls ? 'tool-calls' : 'stop' },
        ...(Array.isArray(event.response?.output) || replayItems.size ? { replayState: { response: { format: 'chatgpt-plan-v1', model, output } } } : {}) }; return;
    }
  }
  if (!completed) throw new AccountError('STREAM_NOT_COMPLETED');
}
