import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import manifest from './package.json' with { type: 'json' };

export const ORIGIN = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const APP_NAME = 'Yuzu QQ Bot';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const authDirectory = () => process.env.QQBOT_CHATGPT_DIR || path.resolve('data/chatgpt-plan');
export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
export class AccountError extends Error {
  constructor(code, status) { super(code); this.name = 'ChatGPTAccountError'; this.code = code; this.status = status; }
}
export function checkIdentity(payload, clientId, nonce, previous) {
  if (payload.iss !== ORIGIN || !(Array.isArray(payload.aud) ? payload.aud.includes(clientId) : payload.aud === clientId)
      || typeof payload.sub !== 'string' || !payload.sub || payload.nonce !== nonce
      || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now() - 5000) throw new AccountError('IDENTITY_INVALID');
  if (previous && (previous.subject !== payload.sub || previous.issuer !== payload.iss || previous.client_id !== clientId)) throw new AccountError('ACCOUNT_CHANGED');
}
export function normalizedTokens(data, clientId, previous = {}) {
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : previous.scopes || [];
  if (!scopes.includes('chatgpt.tokens.use.direct')) throw new AccountError('PLAN_PERMISSION_MISSING');
  if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new AccountError('TOKEN_INVALID');
  const refresh = data.refresh_token || previous.refresh_token;
  if (typeof refresh !== 'string' || !refresh) throw new AccountError('REFRESH_TOKEN_MISSING');
  return { ...previous, client_id: clientId, access_token: data.access_token, refresh_token: refresh,
    id_token: data.id_token || previous.id_token, scopes, expires_at: Date.now() + data.expires_in * 1000, saved_at: new Date().toISOString() };
}
export class ChatGPTAccount {
  constructor(directory = authDirectory(), fetcher = fetch) { this.directory = directory; this.fetcher = fetcher; this.file = path.join(directory, 'credentials.json'); }
  status() {
    const credentials = readJson(this.file), status = readJson(path.join(this.directory, 'status.json'), {});
    return { connected: Boolean(credentials?.access_token && credentials.scopes?.includes('chatgpt.tokens.use.direct')),
      expiresAt: credentials?.expires_at, email: credentials?.email || '', loginStatus: status.phase || '', error: status.error || '',
      tested: Boolean(readJson(path.join(this.directory, 'probe.json'))?.success) };
  }
  setStatus(phase, error = '') { atomicJson(path.join(this.directory, 'status.json'), { phase, error, at: Date.now() }); }
  async tokenRequest(body, signal) {
    let response;
    try { response = await this.fetcher(`${ORIGIN}/api/accounts/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, signal: signal || AbortSignal.timeout(20000) }); }
    catch { throw new AccountError('AUTH_NETWORK'); }
    if (!response.ok) { await response.body?.cancel(); throw new AccountError(response.status === 400 ? 'REAUTHORIZE_REQUIRED' : 'TOKEN_EXCHANGE_FAILED', response.status); }
    return response.json();
  }
  async withLock(action) {
    fs.mkdirSync(this.directory, { recursive: true });
    const file = path.join(this.directory, 'auth.lock'), deadline = Date.now() + 30000;
    let fd;
    while (fd === undefined) {
      try { fd = fs.openSync(file, 'wx', 0o600); fs.writeFileSync(fd, String(process.pid)); }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        let modified; try { modified = fs.statSync(file).mtimeMs; } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
        if (Date.now() - modified > 300000) { try { fs.unlinkSync(file); } catch {} }
        if (Date.now() > deadline) throw new AccountError('ACCOUNT_BUSY');
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    try { return await action(); } finally { fs.closeSync(fd); fs.unlinkSync(file); }
  }
  async accessToken(force = false) {
    return this.withLock(async () => {
      const current = readJson(this.file);
      if (!current?.access_token) throw new AccountError('LOGIN_REQUIRED');
      if (!current.scopes?.includes('chatgpt.tokens.use.direct')) throw new AccountError('PLAN_PERMISSION_MISSING');
      if (!force && current.expires_at > Date.now() + 180000) return current.access_token;
      try {
        const data = await this.tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', client_id: current.client_id, refresh_token: current.refresh_token, resource: RESOURCE }));
        const updated = normalizedTokens({ ...data, id_token: undefined }, current.client_id, current);
        atomicJson(this.file, updated); this.setStatus('connected'); return updated.access_token;
      } catch (e) { this.setStatus('reauthorize', e.code || 'REFRESH_FAILED'); throw e; }
    });
  }
  async api(endpoint, init = {}, retry = true) {
    if (!['/models', '/responses'].includes(endpoint)) throw new AccountError('ENDPOINT_REJECTED');
    const token = await this.accessToken();
    let response;
    try { response = await this.fetcher(`${RESOURCE}${endpoint}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, 'user-agent': init.headers?.['user-agent'] || `yuzu-qqbot/${manifest.version}` }, signal: init.signal || AbortSignal.timeout(120000) }); }
    catch (e) { if (init.signal?.aborted) throw e; const error = new AccountError('PROVIDER_NETWORK'); const code = e?.cause?.code || e?.code; if (typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code)) error.networkCode = code; throw error; }
    if (response.status === 401 && retry) { await response.body?.cancel(); await this.accessToken(true); return this.api(endpoint, init, false); }
    if (!response.ok) {
      const error = new AccountError(response.status === 429 ? 'RATE_LIMIT' : response.status === 403 ? 'MODEL_OR_PLAN_UNAVAILABLE' : 'PROVIDER_HTTP_ERROR', response.status);
      try { const data = await response.json(); for (const [field, key] of [['providerCode', 'code'], ['parameter', 'param']]) { const value = data.error?.[key]; if (typeof value === 'string' && /^[A-Za-z0-9_.\[\]-]{1,120}$/.test(value)) error[field] = value; } } catch {}
      throw error;
    }
    return response;
  }
  async models() {
    const response = await this.api('/models', { signal: AbortSignal.timeout(25000) });
    const value = await response.json();
    const list = (value.models || value.data || []).filter((m) => m.visibility === undefined || m.visibility === 'list').map((m) => ({
      id: m.slug || m.id, name: m.display_name || m.name || m.slug || m.id,
      contextWindow: m.context_window || m.context_length || 128000,
      inputModalities: m.input_modalities || ['text', 'image'], reasoning: m.supported_reasoning_levels || [],
    })).filter((m) => typeof m.id === 'string' && /^[A-Za-z0-9._:-]{1,150}$/.test(m.id));
    if (!list.length) throw new AccountError('NO_MODELS');
    atomicJson(path.join(this.directory, 'models.json'), { fetchedAt: Date.now(), models: list }); this.setStatus('connected'); return list;
  }
  async login(openBrowser = true) {
    const hostFile = path.join(this.directory, 'host.json');
    let host = readJson(hostFile);
    if (!host) { host = { id: randomUUID() }; atomicJson(hostFile, host); }
    const previous = readJson(this.file), registration = readJson(path.join(this.directory, 'registration.json'));
    const selectedClient = previous?.client_id || registration?.client_id;
    const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
    let accept, reject, consumed = false, timer;
    const done = new Promise((resolve, fail) => { accept = resolve; reject = fail; });
    const html = (res, status, message) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }); res.end(`<meta charset="utf-8"><title>Yuzu QQ Bot</title><h2>${message}</h2><p>可以关闭此网页，返回柚柚控制台。</p>`); };
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method !== 'GET' || url.pathname !== '/auth/callback') return html(res, 404, '未找到页面');
      const received = url.searchParams.get('state') || '';
      if (!/^[A-Za-z0-9_-]{43}$/.test(received) || !timingSafeEqual(Buffer.from(received), Buffer.from(state)) || consumed) return html(res, 400, '授权请求不匹配或已使用，请从控制台重试');
      consumed = true;
      if (url.searchParams.has('error')) { html(res, 400, '你取消了授权'); reject(new AccountError('CONSENT_DENIED')); return; }
      try {
        const code = url.searchParams.get('code'), clientId = url.searchParams.get('client_id') || selectedClient;
        if (!code || !clientId || clientId === 'dynamic_agent_client' || (selectedClient && clientId !== selectedClient)) throw new AccountError('REGISTRATION_INVALID');
        atomicJson(path.join(this.directory, 'registration.json'), { client_id: clientId });
        const token = await this.tokenRequest(new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri, resource: RESOURCE }));
        if (!token.id_token) throw new AccountError('ID_TOKEN_MISSING');
        const jwks = createRemoteJWKSet(new URL(`${ORIGIN}/.well-known/jwks.json`), { timeoutDuration: 20000 });
        const verified = await jwtVerify(token.id_token, jwks, { issuer: ORIGIN, audience: clientId, requiredClaims: ['sub', 'exp', 'iat', 'nonce'], clockTolerance: 5, algorithms: ['RS256', 'ES256'] });
        checkIdentity(verified.payload, clientId, nonce, previous);
        const credentials = normalizedTokens(token, clientId, { issuer: ORIGIN, subject: verified.payload.sub, email: typeof verified.payload.email === 'string' ? verified.payload.email : '', ext_agent_host_id: `urn:uuid:${host.id}` });
        await this.withLock(() => atomicJson(this.file, credentials));
        this.setStatus('connected'); html(res, 200, 'ChatGPT 已连接并完成套餐使用授权'); accept(true);
      } catch (e) { html(res, 400, '授权尚未完成，请返回控制台查看状态或重新授权'); reject(new AccountError(e.code || 'IDENTITY_VALIDATION_FAILED')); }
    });
    await new Promise((resolve, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', resolve); });
    const redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
    const url = new URL(`${ORIGIN}/api/accounts/authorize`);
    url.search = new URLSearchParams({ client_id: selectedClient || 'dynamic_agent_client', ...(!selectedClient ? { agent_name_hint: APP_NAME } : {}),
      ext_agent_host_id: `urn:uuid:${host.id}`, response_type: 'code', redirect_uri: redirectUri, scope: SCOPES, resource: RESOURCE,
      state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    this.setStatus('waiting-for-browser');
    if (openBrowser) {
      if (process.platform !== 'win32') throw new AccountError('OPEN_BROWSER_MANUALLY');
      const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url.toString()], { windowsHide: true, detached: true, stdio: 'ignore', shell: false }); child.unref();
    }
    timer = setTimeout(() => reject(new AccountError('LOGIN_TIMEOUT')), 10 * 60000);
    try { await done; return await this.models(); }
    catch (e) { this.setStatus('login-failed', e.code || 'LOGIN_FAILED'); throw e; }
    finally { clearTimeout(timer); server.closeAllConnections(); server.close(); }
  }
}
