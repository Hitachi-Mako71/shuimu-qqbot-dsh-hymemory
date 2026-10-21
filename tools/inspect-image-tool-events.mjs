// Read-only vision metadata; never print conversation or tool result bodies.
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const project = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const runtime = resolve(project, 'runtime/node_modules/@deepseek-ai');
const load = name => import(pathToFileURL(resolve(runtime, name, 'lib/index.js')));
const { Context } = await load('cordis');
const ctx = new Context();
const plugin = ctx.plugin(await load('dsh-session-persistence-jsonl'), { root: resolve(project, 'data/sessions') });
await plugin.await();
try {
  const store = ctx.get('sessionPersistence');
  const found = [];
  for (const { header } of await store.list()) {
    const handle = await store.open(header.id, 'read');
    try {
      const { events } = await handle.read();
      const visionIds = new Set(events.filter(e => e.type === 'tool/call' && e.data?.name === 'qqbot_describe_image').map(e => e.data.callId));
      for (const event of events) {
        if (event.type === 'tool/result' && visionIds.has(event.data?.message?.toolCallId)) {
          found.push({ vision_result_seq: event.seq, isError: Boolean(event.data.message.isError), resultPresent: true });
        }
      }
      if (visionIds.size) found.push({ visionCallCount: visionIds.size });
    } finally { await handle.close(); }
  }
  console.log(JSON.stringify({ recent_image_tool_events: found }));
} finally { await plugin.dispose(); }
