"""Loopback Hy Memory bridge, local embeddings, durable QQ turn outbox."""
from __future__ import annotations

import hmac
import json
import logging
import os
from pathlib import Path
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from dotenv import load_dotenv
from memory_outbox import Outbox
from memory_network import sdk_config

load_dotenv(Path(__file__).with_name('.env'))
HOST = '127.0.0.1'
PORT = int(os.environ.get('MEMORY_BRIDGE_PORT', '8765'))
TOKEN = os.environ.get('MEMORY_BRIDGE_TOKEN', '')
DATA = Path(os.environ.get('MEMORY_BRIDGE_DATA_DIR', str(Path(__file__).parent / 'data')))
AGENT = 'qqbot-hymemory'
_client: Any = None
_client_lock = threading.Lock()
_write_lock = threading.RLock()
_embed_lock = threading.Lock()
_embedding: Any = None
_outbox: Any = None
_audit_lock = threading.Lock()
_stop = threading.Event()


def get_client():
    global _client
    with _client_lock:
        if _client is None:
            from hy_memory import HyMemoryClient
            logging.getLogger('hy_memory').setLevel(logging.WARNING)
            _client = HyMemoryClient(config=sdk_config(), mode=os.environ.get('MEMORY_MODE', 'pro'))
            # The SDK installs INFO handlers during construction; suppress
            # request/query content while retaining our ID-only audit log.
            logging.disable(logging.INFO)
        return _client


def get_outbox():
    global _outbox
    if _outbox is None:
        _outbox = Outbox(DATA / 'outbox.sqlite3')
    return _outbox


def get_embedding():
    global _embedding
    with _embed_lock:
        if _embedding is None:
            from fastembed import TextEmbedding
            _embedding = TextEmbedding(
                os.environ.get('MEMORY_LOCAL_EMBEDDING_MODEL', 'BAAI/bge-small-zh-v1.5'),
                cache_dir=str(DATA / 'models'), threads=4,
            )
        return _embedding


def normalize_memories(result):
    rows = []
    if isinstance(result, list):
        rows.extend(('chat', item) for item in result)
    elif isinstance(result, dict):
        for item in result.get('vdb', {}).get('memories', []):
            rows.append(('vdb', item))
        memories = result.get('memories', {})
        if isinstance(memories, list):
            rows.extend(('chat', item) for item in memories)
        elif isinstance(memories, dict):
            for bucket, items in memories.items():
                if isinstance(items, list):
                    rows.extend((bucket, item) for item in items)
    normalized = []
    seen = set()
    for channel, item in rows:
        if not isinstance(item, dict):
            continue
        memory_id = item.get('memory_id') or item.get('id')
        content = item.get('content') or item.get('text')
        if not memory_id or not content or memory_id in seen:
            continue
        seen.add(memory_id)
        normalized.append({
            'id': memory_id, 'content': str(content)[:1600],
            'layer': item.get('layer', ''), 'source': item.get('source', 'qqbot-dsh'),
            'channel': channel, 'score': item.get('score'),
            'session_id': item.get('session_id'), 'meta': item.get('meta', []),
        })
    return normalized


def audit(operation, user_id, memories=(), **extra):
    DATA.mkdir(parents=True, exist_ok=True)
    row = {'operation': operation, 'namespace': user_id, 'sources': [
        {'id': m['id'], 'layer': m.get('layer'), 'channel': m.get('channel'), 'score': m.get('score')} for m in memories
    ], **extra}
    with _audit_lock, (DATA / 'memory-audit.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(row, ensure_ascii=False) + '\n')


def write_memory(body):
    data = body.get('messages') or body.get('text')
    if not data:
        raise ValueError('text or messages is required')
    result = get_client().add(
        data, scene='chat', user_id=body['user_id'], agent_id=AGENT,
        session_id=str(body.get('session_id') or 'explicit-memory'), source='qqbot-dsh',
        request_id=body.get('job_id'),
        meta={'message_id': body.get('message_id'), 'scope': body.get('scope')},
    )
    if not isinstance(result, dict) or result.get('success') is not True:
        raise RuntimeError('SDK reported unsuccessful write')
    audit('write', body['user_id'], request_id=result.get('request_id'))
    return result


def worker():
    queue = get_outbox()
    while not _stop.is_set():
        job = queue.claim()
        if not job:
            _stop.wait(1)
            continue
        try:
            with _write_lock:
                if not queue.is_running(job['id']):
                    continue
                write_memory(job['payload'])
                queue.done(job['id'])
        except Exception as error:
            queue.retry(job['id'], type(error).__name__, job['attempts'])
            print(f'[memory-bridge] write queued for retry ({type(error).__name__})', flush=True)


class Handler(BaseHTTPRequestHandler):
    server_version = 'HyMemoryBridge/2.0'

    def log_message(self, fmt, *args):
        # No bodies, headers, user text, model output, or credentials in logs.
        print(f'[memory-bridge] {fmt % args}', flush=True)

    def _json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        try:
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def _body(self):
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 <= size <= 1_000_000:
            raise ValueError('request body exceeds 1 MB')
        body = json.loads(self.rfile.read(size).decode('utf-8') or '{}')
        if not isinstance(body, dict):
            raise ValueError('JSON body must be an object')
        return body

    def _authorized(self):
        if not TOKEN or not hmac.compare_digest(self.headers.get('Authorization', ''), f'Bearer {TOKEN}'):
            self._json(401, {'ok': False, 'error': 'unauthorized'})
            return False
        return True

    def do_GET(self):
        if self.path == '/health':
            self._json(200, {'ok': True, 'sdk_ready': _client is not None, 'embedding_ready': _embedding is not None, 'queue': get_outbox().stats()})
        else:
            self._json(404, {'ok': False, 'error': 'not found'})

    def do_POST(self):
        if not self._authorized():
            return
        try:
            body = self._body()
            if self.path == '/v1/embeddings':
                texts = body.get('input', [])
                if isinstance(texts, str):
                    texts = [texts]
                if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts) or len(texts) > 256:
                    raise ValueError('input must be a string or at most 256 strings')
                vectors = list(get_embedding().embed(texts))
                self._json(200, {'object': 'list', 'model': body.get('model'), 'data': [
                    {'object': 'embedding', 'index': i, 'embedding': vector.tolist()} for i, vector in enumerate(vectors)
                ], 'usage': {'prompt_tokens': 0, 'total_tokens': 0}})
                return
            user_id = str(body.get('user_id', ''))
            if not re.fullmatch(r'qq-[a-f0-9]{64}', user_id):
                raise ValueError('a server-derived QQ identity namespace is required')
            if self.path == '/status':
                self._json(200, {'ok': True, 'queue': get_outbox().stats()})
                return
            if self.path == '/enqueue':
                job_id = str(body.get('job_id', ''))
                if not re.fullmatch(r'[a-f0-9]{64}', job_id) or not body.get('messages'):
                    raise ValueError('stable job_id and messages are required')
                get_outbox().enqueue(job_id, body)
                self._json(202, {'ok': True, 'queued': job_id})
                return
            client = get_client()
            if self.path == '/search':
                query = str(body.get('query') or '').strip()
                if not query:
                    raise ValueError('query is required')
                result = client.search(query, scene='chat', user_ids=[user_id], agent_ids=[AGENT], include_sources=['qqbot-dsh'], limit=min(max(int(body.get('limit', 8)), 1), 20))
                memories = normalize_memories(result)
                audit('search', user_id, memories)
                self._json(200, {'ok': True, 'memories': memories})
            elif self.path == '/list':
                result = client.list_memories(user_id=user_id, agent_id=AGENT, limit=30)
                self._json(200, {'ok': True, 'memories': normalize_memories(result)})
            elif self.path == '/add':
                with _write_lock:
                    result = write_memory(body)
                    memories = normalize_memories(client.list_memories(user_id=user_id, agent_id=AGENT, limit=15))
                self._json(200, {'ok': True, 'request_id': result.get('request_id'), 'memories': memories})
            elif self.path == '/delete':
                memory_id = str(body.get('id') or '')
                with _write_lock:
                    memory = client.get(memory_id)
                    if not memory or memory.get('user_id') != user_id or memory.get('agent_id') != AGENT:
                        self._json(404, {'ok': False, 'error': 'memory not found in this identity partition'})
                        return
                    # Cancel older in-flight/pending turns before deleting so
                    # a delayed writer cannot recreate the forgotten fact.
                    get_outbox().cancel_user(user_id)
                    result = client.delete(memory_id)
                    if not result.get('success'):
                        raise RuntimeError('SDK reported unsuccessful deletion')
                audit('delete', user_id, deleted_id=memory_id)
                self._json(200, {'ok': True, 'deleted': memory_id})
            else:
                self._json(404, {'ok': False, 'error': 'not found'})
        except (ValueError, json.JSONDecodeError) as error:
            self._json(400, {'ok': False, 'error': str(error)})
        except Exception as error:
            self._json(503, {'ok': False, 'error': f'Hy Memory operation failed: {type(error).__name__}'})


def warmup():
    try:
        get_embedding()
        get_client()
        print('Hy Memory SDK and local embedding ready', flush=True)
    except Exception as error:
        print(f'Hy Memory warmup unavailable ({type(error).__name__}); requests will retry initialization', flush=True)


def main():
    if not TOKEN:
        raise SystemExit('Set MEMORY_BRIDGE_TOKEN in local .env before starting')
    DATA.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    get_outbox()
    threading.Thread(target=warmup, daemon=True).start()
    threading.Thread(target=worker, daemon=True).start()
    print(f'Hy Memory bridge listening on http://{HOST}:{PORT}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _stop.set()
        server.server_close()
        if _client is not None:
            _client.close()


if __name__ == '__main__':
    main()
