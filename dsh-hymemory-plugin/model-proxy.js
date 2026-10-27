import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { memoryModelRoute } from './model-route.js';

export async function startModelProxy(ctx) {
  const { BlockAssembler, createUserMessage, createAssistantMessage, createSystemMessage, createToolResultMessage } = await import('@deepseek-ai/dsh-llm');
  const token = process.env.MEMORY_BRIDGE_TOKEN;
  if (!token) throw new Error('MEMORY_BRIDGE_TOKEN must be set');
  const digest = (s) => createHash('sha256').update(s).digest();
  const expected = digest(`Bearer ${token}`);
  const server = createServer(async (req, res) => {
    const { provider, model } = memoryModelRoute();
    const send = (status, body) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/health') return send(200, { ok: true, provider, model });
    if (!timingSafeEqual(expected, digest(String(req.headers.authorization || '')))) return send(401, { error: { message: 'Unauthorized' } });
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return send(404, { error: { message: 'Not found' } });
    try {
      let raw = '';
      for await (const part of req) {
        raw += part.toString('utf8');
        if (Buffer.byteLength(raw) > 2_000_000) throw new Error('Request too large');
      }
      const body = JSON.parse(raw);
      const messages = (body.messages || []).map((m) => {
        const content = [{ type: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }];
        if (m.role === 'system' || m.role === 'developer') return createSystemMessage(content[0].text);
        if (m.role === 'tool') return createToolResultMessage({ callId: m.tool_call_id, content, isError: false });
        if (m.role === 'assistant') {
          for (const call of m.tool_calls || []) content.push({ type: 'tool-call', id: call.id, name: call.function.name, arguments: call.function.arguments });
          return createAssistantMessage({ content, source: { kind: 'model', provider, model } });
        }
        return createUserMessage({ content, source: { kind: 'user' } });
      });
      const tools = body.tools?.map((t) => ({ name: t.function.name, description: t.function.description || '', parameters: t.function.parameters || { type: 'object', properties: {} } }));
      const assembler = new BlockAssembler();
      let usage = {};
      for await (const chunk of ctx.get('llm').stream({ provider, model, messages, ...(tools?.length ? { tools } : {}), reasoningEffort: 'off', maxTokens: Math.min(body.max_tokens || 2500, 8192), signal: AbortSignal.timeout(120000) })) {
        assembler.push(chunk);
        if (chunk.type === 'usage') usage = chunk.usage || chunk;
      }
      if (['error', 'aborted'].includes(assembler.finish.kind)) throw new Error(`Harness LLM ${assembler.finish.failure?.code || assembler.finish.kind}`);
      const blocks = assembler.blocks();
      const content = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = blocks.filter((b) => b.type === 'tool-call').map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: b.arguments } }));
      send(200, {
        id: `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
        choices: [{ index: 0, message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: usage.input || 0, completion_tokens: usage.output || 0, total_tokens: (usage.input || 0) + (usage.output || 0) },
      });
    } catch (error) {
      console.warn(`[qq-hymemory-model] request failed (${error?.name || 'Error'})`);
      send(503, { error: { message: 'Harness memory model unavailable', type: 'provider_unavailable' } });
    }
  });
  await ctx.effect(async () => {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(Number(process.env.MEMORY_DSH_PORT || 8766), '127.0.0.1', resolve);
    });
    const { provider, model } = memoryModelRoute();
    console.log(`[qq-hymemory-model] loopback proxy ready (${provider}/${model})`);
    return () => { server.closeAllConnections(); server.close(); };
  }, 'qq-hymemory.model-proxy');
}
