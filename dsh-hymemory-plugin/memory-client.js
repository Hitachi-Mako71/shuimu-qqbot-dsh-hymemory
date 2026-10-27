import { qqIdentity, memoryNamespace } from './identity.js';

export async function memoryRequest(endpoint, identity, body = {}, timeout = 5000) {
  const trusted = qqIdentity(identity);
  const base = new URL(process.env.MEMORY_BRIDGE_URL || 'http://127.0.0.1:8765');
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Memory bridge must use loopback HTTP');
  const token = process.env.MEMORY_BRIDGE_TOKEN;
  if (!token) throw new Error('Memory bridge token missing');
  const response = await fetch(new URL(endpoint, base), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...body, identity: trusted, user_id: memoryNamespace(trusted), scope: trusted.scope }),
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json();
  if (response.status === 403) throw new Error('MemoryPermissionRejected');
  if (!response.ok || !payload.ok) throw new Error('MemoryOperationUnavailable');
  return payload;
}
