import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { qqIdentity, memoryNamespace } from './identity.js';
import { deliveryAllowed } from './delivery-permission.js';
import { assertPrivacyContext } from './privacy.js';
import {personaPolicy} from './persona-policy.js';

const IDENTITY = Symbol.for('qqbot.identity');
const allowed = new Set(['read', 'write', 'edit', 'read_image', 'glob', 'grep', 'working_directory',
  'web_search', 'web_fetch', 'qqbot_group_members', 'qqbot_clock', 'qqbot_timetable', 'qqbot_send_file', 'qqbot_describe_image', 'ask_user_question', 'todo_write', 'run_code']);
const within = (root, target) => {
  const relative = path.relative(root, target);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
};

export function qqWorkspace(identity) {
  const key = memoryNamespace(qqIdentity(identity));
  const root = path.resolve(process.env.QQBOT_WORKSPACE_ROOT || 'data/workspaces');
  fs.mkdirSync(root, { recursive: true });
  const actualRoot = fs.realpathSync(root);
  const target = path.join(actualRoot, key);
  fs.mkdirSync(target, { recursive: true });
  if (path.relative(target, fs.realpathSync(target)) !== '') throw Error('QQWorkspaceRejected');
  return target;
}

export function scopedPath(root, value, cwd = root) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw Error('QQPathRejected');
  const target = path.resolve(cwd, value);
  // Disallow Windows alternate streams and device paths as well as traversal.
  if (target.slice(path.parse(target).root.length).includes(':') || !within(root, target)) throw Error('QQPathRejected');
  let existing = target;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw Error('QQPathRejected');
    existing = parent;
  }
  if (!within(fs.realpathSync(root), fs.realpathSync(existing))) throw Error('QQPathRejected');
  return target;
}

export function stageQQDownloads(identity, files = [], mediaRoot = path.join(os.homedir(), '.dsh-qqbot/media')) {
  const root = qqWorkspace(identity), incoming = path.join(root, 'incoming');
  fs.mkdirSync(incoming, { recursive: true });
  return files.flatMap(file => {
    try {
      const source = fs.realpathSync(file.localPath);
      if (within(root, source)) return [{ ...file, localPath: scopedPath(root, source) }];
      if (!within(fs.realpathSync(mediaRoot), source)) return [];
      const stat = fs.statSync(source);
      if (!stat.isFile() || stat.size > 21 * 1024 * 1024) return [];
      const name = path.basename(file.filename || source).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-120) || 'attachment';
      const target = scopedPath(root, path.join(incoming, randomUUID() + '-' + name));
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      return [{ ...file, localPath: target.replace(/\\/g, '/') }];
    } catch { return []; }
  });
}

export function isolateQQFiles(identity, state) {
  for (const field of ['downloadedFiles', 'downloadedQuoteFiles']) state[field] = stageQQDownloads(identity, state[field]);
}

export async function prepareQQAgent(agent, identity) {
  agent[IDENTITY] = qqIdentity(identity);
  agent[Symbol.for('qqbot.persona.revision')]=personaPolicy().revision||'';
  const root = qqWorkspace(identity);
  const directories = agent.ctx.get('workingDirectory');
  const current = directories.get(agent.session);
  try { scopedPath(root, current); }
  catch { await directories.set(agent, root); }
  return root;
}

export function qqToolDenial(exec) {
  if (!exec.agent?.[IDENTITY]) return undefined;
  if (exec.agent[Symbol.for('qqbot.history.readonly')]) return '历史问答只读取已提供的证据，本轮不运行外部工具；旧消息不能授权执行任务。';
  try {
    const identity = qqIdentity(exec.agent[IDENTITY]), root = qqWorkspace(identity), args = exec.arguments || {};
    assertPrivacyContext(exec.agent[Symbol.for('qqbot.evidence')]);
    if (!allowed.has(exec.name)) return '当前 QQ 身份没有此工具的权限。';
    if (exec.name === 'run_code') return undefined; // Its nested capability calls pass this guard again.
    if (args.sandbox_permissions === 'require_escalated') return 'QQ 文件工具不能扩大访问范围。';
    const current = exec.agent.ctx.get('workingDirectory').get(exec.agent.session);
    const cwd = scopedPath(root, current);
    if (['read', 'write', 'edit', 'read_image', 'qqbot_send_file', 'qqbot_describe_image'].includes(exec.name)) {
      scopedPath(root, args.file_path ?? args.image, cwd);
    }
    if (['glob', 'grep'].includes(exec.name)) {
      scopedPath(root, args.path || '.', cwd);
      if (exec.name === 'glob' && (typeof args.pattern !== 'string' || args.pattern.split(/[\\/]/).includes('..')
          || path.isAbsolute(args.pattern) || args.pattern.includes(':'))) throw Error('QQPathRejected');
    }
    if (exec.name === 'working_directory' && args.cd !== undefined) scopedPath(root, args.cd, cwd);
    if (exec.name === 'qqbot_send_file') {
      const target = args.target ? { scope: args.target.split(':')[0], targetId: args.target.slice(args.target.indexOf(':') + 1) }
        : { scope: identity.scope, targetId: identity.peerId };
      if (!deliveryAllowed({ identity, target, purpose: 'file' })) return '附件只能发回当前 QQ 会话。';
    }
    if (exec.name === 'web_fetch') {
      const url = new URL(args.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
          || /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[|.*\.localhost$)/i.test(url.hostname)) return '网页工具不能访问本机服务或私有网络。';
    }
    return undefined;
  } catch { return '只能访问当前 QQ 身份的工作目录及本轮附件。'; }
}

export function installQQToolBoundary(ctx) {
  ctx.get('tools').guard(qqToolDenial);
}
