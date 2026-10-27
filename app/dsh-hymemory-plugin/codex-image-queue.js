import { spawn } from 'node:child_process';

// Queue access is used only for explicit, user-requested native image jobs.
export function enqueueImageTask(cfg, message) {
  return new Promise((resolve, reject) => {
    const child = spawn(cfg.codexPath, ['queue', '--thread', cfg.threadId, '--message', message], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_THREAD_ID: cfg.threadId },
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('QueueTimeout')); }, 20000);
    child.stdout.on('data', (data) => { output = (output + data.toString()).slice(-4096); });
    child.stderr.on('data', () => {});
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const match = output.match(/Queued message ([0-9a-f-]{36}) for thread ([0-9a-f-]{36})/i);
      if (code === 0 && match?.[2] === cfg.threadId) resolve(match[1]);
      else reject(new Error('QueueNotConfirmed'));
    });
  });
}
