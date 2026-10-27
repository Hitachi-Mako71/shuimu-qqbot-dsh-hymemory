// Read-only validation through DSH's actual JSONL backend, not a custom decoder.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const project = resolve(process.argv[2] || fileURLToPath(new URL('.', import.meta.url)));
const runtime = resolve(project, 'runtime/node_modules/@deepseek-ai');
const load = name => import(pathToFileURL(resolve(runtime, name, 'lib/index.js')));
const { Context } = await load('cordis');
const backend = await load('dsh-session-persistence-jsonl');
const ctx = new Context();
const plugin = ctx.plugin(backend, { root: resolve(project, 'data/sessions') });
await plugin.await();
try {
  const persistence = ctx.get('sessionPersistence');
  const sessions = await persistence.list();
  assert.ok(sessions.length > 0, 'No persisted QQ sessions found');
  const results = [];
  for (const { header } of sessions) {
    const handle = await persistence.open(header.id, 'read');
    try {
      const { events } = await handle.read();
      assert.ok(events.length > 0, 'Persisted session is empty');
      results.push({ session_id: header.id, validated_event_count: events.length });
    } finally { await handle.close(); }
  }
  writeFileSync('acceptance-session-storage-results.json', JSON.stringify({
    real_dsh_jsonl_backend: true, read_only: true, sessions: results,
  }, null, 2));
  console.log(`REAL_DSH_SESSION_STORAGE_OK sessions=${results.length}`);
} finally { await plugin.dispose(); }
