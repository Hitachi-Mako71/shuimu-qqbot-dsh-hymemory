"""Loopback Hy Memory bridge, local embeddings, durable QQ turn outbox."""
from __future__ import annotations

import gc
import hmac
import json
import logging
import os
from pathlib import Path
import re
import threading
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from dotenv import load_dotenv
from memory_outbox import Outbox
from evidence_queue import EvidenceQueue
from privacy_ledger import PrivacyLedger, PrivacyBlocked, evidence_ids
from memory_lifecycle import MemoryLifecycle
from history_recall import HistoryRecall
from memory_gateway import MemoryGateway, HyMemoryAdapter, normalize_memories
from hindsight_adapter import HindsightAdapter
from memory_network import sdk_config
from qq_identity import validate_request

load_dotenv(Path(__file__).with_name('.env'))
HOST = '127.0.0.1'
PORT = int(os.environ.get('MEMORY_BRIDGE_PORT', '8765'))
TOKEN = os.environ.get('MEMORY_BRIDGE_TOKEN', '')
DATA = Path(os.environ.get('MEMORY_BRIDGE_DATA_DIR', str(Path(__file__).parent / 'data')))
AGENT = 'qqbot-hymemory'
_client: Any = None
_client_lock = threading.Lock()
_hindsight_lifecycle_lock = threading.Lock()
_write_lock = threading.RLock()
_embed_lock = threading.RLock()
_embedding: Any = None
_embedding_last_used = 0.0
_embedding_idle_seconds = 300
_outbox: Any = None
_evidence: Any = None
_lifecycle: Any = None
_hindsight_lifecycle: Any = None
_privacy_launch_lock=threading.Lock()
_audit_lock = threading.Lock()
_stop = threading.Event()


def get_client():
    global _client
    with _client_lock:
        if _client is None:
            config_file=DATA/'memory-engine.json'
            engine=json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
            if engine.get('primary') not in (None,'hy-memory','hindsight'):
                raise RuntimeError('Unknown memory engine; refusing silent fallback')
            if engine.get('primary')=='hindsight':
                if engine.get('version')!='1.1.0' or engine.get('migration_complete') is not True:
                    raise RuntimeError('Verified Hindsight migration selection required')
                client=HindsightAdapter(TOKEN, lifecycle=get_hindsight_lifecycle())
                _client=client
                return _client
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


def embed_texts(texts):
    global _embedding_last_used
    with _embed_lock:
        vectors = list(get_embedding().embed(texts))
        _embedding_last_used = time.monotonic()
        return vectors


def release_embedding_if_idle(force=False):
    global _embedding, _embedding_last_used
    with _embed_lock:
        if _embedding is None or (not force and time.monotonic() - _embedding_last_used < _embedding_idle_seconds):
            return False
        _embedding = None
        _embedding_last_used = 0.0
    gc.collect()
    return True


def memory_queues_idle():
    try:
        statuses = (get_outbox().stats(), get_evidence_queue().stats())
        queues_idle = not any(stats.get(state, 0) for stats in statuses for state in ('pending', 'running'))
        return queues_idle and not get_lifecycle().ledger.operations(pending=True)
    except Exception:
        return False


def get_hindsight_lifecycle():
    global _hindsight_lifecycle
    with _hindsight_lifecycle_lock:
        if _hindsight_lifecycle is None:
            from hindsight_adapter import ManagedHindsightLifecycle
            _hindsight_lifecycle = ManagedHindsightLifecycle(DATA.resolve().parent, idle_seconds=300)
        return _hindsight_lifecycle


def get_evidence_queue():
    global _evidence
    if _evidence is None:
        directory = Path(os.environ.get('QQBOT_EVIDENCE_DIR', str(DATA / 'evidence')))
        _evidence = EvidenceQueue(directory / 'qq-evidence.sqlite3', get_lifecycle().ledger)
    return _evidence


def get_lifecycle():
    global _lifecycle
    if _lifecycle is None:
        project=DATA.resolve().parent
        ledger=PrivacyLedger(Path(os.environ.get('QQBOT_PRIVACY_DIR',str(project/'.privacy')))/'lifecycle.sqlite3')
        _lifecycle=MemoryLifecycle(project,ledger)
    return _lifecycle


def kick_privacy_worker():
    # The real helper is parented by WMI, so stopping this service cannot kill
    # the cleanup process halfway through. It acquires the desktop mutex itself.
    if not (get_lifecycle().project/'.run/services.json').exists(): return
    if os.name!='nt' or not _privacy_launch_lock.acquire(blocking=False): return
    def launch():
        try:
            if _stop.wait(4): return
            if not any(r['status']=='pending' for r in get_lifecycle().ledger.operations(pending=True)): return
            path=str(Path(__file__).with_name('apply-privacy.ps1')).replace("'","''")
            command='powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+path+'"'
            escaped=command.replace("'","''")
            script="$s=New-CimInstance -CimClass (Get-CimClass Win32_ProcessStartup) -ClientOnly -Property @{ShowWindow=[uint16]0};$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='"+escaped+"';ProcessStartupInformation=$s};if($r.ReturnValue -ne 0){exit 1}"
            result=subprocess.run(['powershell.exe','-NoProfile','-Command',script],capture_output=True,timeout=20,creationflags=0x08000000)
            if result.returncode: print('[memory-privacy] cleanup remains queued',flush=True)
        except Exception:
            print('[memory-privacy] cleanup launch unavailable; request retained',flush=True)
        finally: _privacy_launch_lock.release()
    threading.Thread(target=launch,daemon=True).start()


def get_gateway():
    ledger=get_lifecycle().ledger
    client=get_client()
    adapter=client if isinstance(client,HindsightAdapter) else HyMemoryAdapter(get_client)
    return MemoryGateway(adapter,ledger,HistoryRecall(get_evidence_queue(),ledger))


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
    evidence = body.get('evidence')
    if evidence:
        # Roles remain intact in the SDK input. Assistant statements prove only
        # what the assistant said, never that the user agreed or an action ran.
        if isinstance(data,str): data=[dict(role='user',content=data)]
        data = [{'role': 'system', 'content': '以下为QQ真实会话证据窗口。user是用户原话；assistant仅是平台接受的助手原话，不代表用户同意、用户事实、工具成功或用户已读。群聊按成员标签分别归属。提炼双方明确偏好、互动和约定时保留说话人和来源；不把助手猜测、玩笑、角色设定、虚构经历当成现实记忆；缺失的上下文不得补写。'}] + data
    result = get_gateway().retain(
        body['user_id'],data,session_id=str(body.get('session_id') or 'explicit-memory'),
        request_id=body.get('job_id'),
        meta={'message_id':body.get('message_id'),'scope':body.get('scope'),
              'actor_id':body.get('identity',{}).get('senderId'),**({'evidence':evidence} if evidence else {})},
        expected_version=(evidence or {}).get('privacy_version',0),source_ids=evidence_ids(body),
    )
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
                validate_request(job['payload'], os.environ.get('QQBOT_APPID'), DATA, '/enqueue')
                body=job['payload'];ledger=get_lifecycle().ledger
                state=ledger.state(body['user_id'])
                source_ids=evidence_ids(body)
                if not source_ids:
                    source_ids=get_evidence_queue().sources_for_message(body['user_id'],body.get('message_id'))
                if state['version']>0 and not source_ids:
                    queue.hold(job['id'])
                    continue
                if source_ids and not body.get('evidence'):
                    body['evidence']=dict(privacy_version=state['version'],sources=[dict(id=i,role='user') for i in source_ids])
                if not queue.is_running(job['id']): continue
                write_memory(body)
                queue.done(job['id'])
        except PrivacyBlocked:
            queue.retry(job['id'],'PrivacyRevisionChanged',job['attempts'])
        except PermissionError:
            queue.hold(job['id'])
            print('[memory-bridge] old or unauthorized job held for review', flush=True)
        except Exception as error:
            queue.retry(job['id'], type(error).__name__, job['attempts'])
            print(f'[memory-bridge] write queued for retry ({type(error).__name__})', flush=True)


def evidence_worker():
    queue = get_evidence_queue()
    while not _stop.is_set():
        job = None
        try:
            if os.environ.get('QQBOT_EVIDENCE_EXTRACT_ENABLED', 'true').lower() in ('false', '0', 'off'):
                _stop.wait(1)
                continue
            job = queue.claim()
            if not job:
                _stop.wait(1)
                continue
            with _write_lock:
                if not queue.is_running(job):
                    continue
                validate_request(job['payload'], os.environ.get('QQBOT_APPID'), DATA, '/enqueue')
                heartbeat_stop = threading.Event()
                def heartbeat(job=job):
                    while not heartbeat_stop.wait(30):
                        try:
                            if not queue.renew(job):
                                return
                        except Exception:
                            print('[memory-evidence] lease renewal unavailable', flush=True)
                            return
                heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
                heartbeat_thread.start()
                try:
                    if queue.renew(job):
                        body=job['payload']
                        if queue.is_running(job):
                            write_memory(body)
                            queue.done(job)
                finally:
                    heartbeat_stop.set()
                    heartbeat_thread.join(timeout=2)
        except PrivacyBlocked:
            if job: queue.retry(job,'PrivacyRevisionChanged')
        except PermissionError:
            if job:
                queue.hold(job)
            print('[memory-evidence] unauthorized source held', flush=True)
        except Exception as error:
            if job:
                queue.retry(job, type(error).__name__)
            print(f'[memory-evidence] retry pending ({type(error).__name__})', flush=True)
            _stop.wait(1)


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
            ready=_client is not None
            try:
                info=get_gateway().info() if _client is not None else {'engine':'warming','single_primary':True}
                if isinstance(_client,HindsightAdapter):ready=_client.health().get('status')=='healthy'
            except Exception:
                ready=False;info={'engine':'unavailable','single_primary':True}
            self._json(200, {'ok': True, 'sdk_ready': ready, 'embedding_ready': _embedding is not None, 'queue': get_outbox().stats(), 'evidence_queue': get_evidence_queue().stats(), 'gateway': info})
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
                vectors = embed_texts(texts)
                self._json(200, {'object': 'list', 'model': body.get('model'), 'data': [
                    {'object': 'embedding', 'index': i, 'embedding': vector.tolist()} for i, vector in enumerate(vectors)
                ], 'usage': {'prompt_tokens': 0, 'total_tokens': 0}})
                return
            user_id = validate_request(body, os.environ.get('QQBOT_APPID'), DATA, self.path)
            body['user_id'] = user_id
            lifecycle=get_lifecycle()
            if self.path.startswith(('/history/','/episodes/')):
                if lifecycle.ledger.state(user_id)['pending']:raise PrivacyBlocked('Deletion cleanup pending')
                history=HistoryRecall(get_evidence_queue(),lifecycle.ledger)
                gateway=get_gateway()
                if self.path=='/history/sources':
                    self._json(200,dict(ok=True,**gateway.recall_sources(user_id,body.get('source_ids'))))
                elif self.path=='/history/search':
                    semantic=[]
                    try:
                        semantic=gateway.recall(user_id,str(body.get('query') or '')[:600],limit=6)['memories']
                    except Exception: pass # bounded lexical originals remain usable during Hy outage
                    result=gateway.recall_history(user_id,body.get('query'),current_message_id=body.get('message_id'),semantic=semantic,from_time=body.get('from_time'),to_time=body.get('to_time'),actor_id=body.get('actor_id'))
                    self._json(200,dict(ok=True,**result))
                elif self.path=='/episodes/list':
                    self._json(200,dict(ok=True,episodes=gateway.agreements(user_id)))
                elif self.path=='/episodes/save':
                    sources=get_evidence_queue().sources_for_message(user_id,body.get('message_id'))
                    if len(sources)!=1:raise ValueError('Current original source required')
                    episode=gateway.save_agreement(user_id,body['identity']['senderId'],sources[0],supersedes=body.get('supersedes'))
                    self._json(200,dict(ok=True,episode=episode))
                else:self._json(404,dict(ok=False,error='not found'))
                return
            if self.path.startswith('/lifecycle/'):
                if self.path=='/lifecycle/recent':
                    self._json(200,dict(ok=True,sources=lifecycle.recent(user_id)))
                elif self.path=='/lifecycle/status':
                    self._json(200,dict(ok=True,**lifecycle.status(user_id)))
                elif self.path=='/lifecycle/preview':
                    ids=body.get('source_ids')
                    if not isinstance(ids,list) or not all(isinstance(i,str) for i in ids): raise ValueError('source_ids required')
                    self._json(200,dict(ok=True,**lifecycle.preview(body['identity'],user_id,ids)))
                elif self.path=='/lifecycle/confirm':
                    operation=lifecycle.confirm(body['identity'],user_id,str(body.get('token') or ''))
                    self._json(200,dict(ok=True,accepted=True,operation_id=operation['id'],complete=False))
                    kick_privacy_worker()
                elif self.path=='/lifecycle/retry':
                    operations=[r for r in lifecycle.ledger.operations(user_id) if r['id']==body.get('operation_id') and r['status']=='blocked']
                    if not operations: raise ValueError('No blocked deletion with this ID')
                    lifecycle.ledger.update(operations[0],'pending')
                    self._json(200,dict(ok=True,accepted=True,complete=False));kick_privacy_worker()
                else: self._json(404,dict(ok=False,error='not found'))
                return
            if self.path == '/status':
                self._json(200, {'ok': True, 'queue': get_outbox().stats(), 'evidence_queue': get_evidence_queue().stats(), 'gateway': get_gateway().info()})
                return
            if self.path == '/enqueue':
                if lifecycle.ledger.state(user_id)['version']>0:
                    raise PrivacyBlocked('Legacy enqueue needs source-aware replay')
                job_id = str(body.get('job_id', ''))
                if not re.fullmatch(r'[a-f0-9]{64}', job_id) or not body.get('messages'):
                    raise ValueError('stable job_id and messages are required')
                get_outbox().enqueue(job_id, body)
                self._json(202, {'ok': True, 'queued': job_id})
                return
            state=lifecycle.ledger.state(user_id)
            if state['pending'] and self.path in ('/search','/list','/add'):
                raise PrivacyBlocked('Deletion cleanup is pending')
            client = get_gateway()
            if self.path == '/search':
                query = str(body.get('query') or '').strip()
                if not query:
                    raise ValueError('query is required')
                result = client.recall(user_id,query,limit=body.get('limit',8))
                memories = result['memories']
                audit('search', user_id, memories)
                self._json(200, {'ok': True, 'memories': memories})
            elif self.path == '/list':
                result = client.list(user_id,limit=30)
                self._json(200, {'ok': True, **result})
            elif self.path == '/add':
                with _write_lock:
                    sources=get_evidence_queue().sources_for_message(user_id,body.get('message_id'))
                    body['evidence']=dict(sources=[dict(id=i,role='user') for i in sources],privacy_version=state['version'])
                    result = write_memory(body)
                    memories = client.list(user_id,limit=15)['memories']
                self._json(200, {'ok': True, 'request_id': result.get('request_id'), 'memories': memories})
            elif self.path == '/delete':
                memory_id = str(body.get('id') or '')
                with _write_lock:
                    operation = client.request_forget(user_id,body['identity'],memory_id,lifecycle)
                    if operation is None:
                        self._json(404, {'ok': False, 'error': 'memory not found in this identity partition'})
                        return
                audit('delete-request', user_id, deleted_id=memory_id)
                self._json(200,dict(ok=True,accepted=True,complete=False,operation_id=operation['id']))
                kick_privacy_worker()
            else:
                self._json(404, {'ok': False, 'error': 'not found'})
        except PrivacyBlocked:
            self._json(409,dict(ok=False,error='Privacy cleanup pending, source deleted, or preview expired'))
        except PermissionError:
            self._json(403, {'ok': False, 'error': 'QQ identity or permission rejected'})
        except (ValueError, json.JSONDecodeError) as error:
            self._json(400, {'ok': False, 'error': str(error)})
        except Exception as error:
            self._json(503, {'ok': False, 'error': f'Hy Memory operation failed: {type(error).__name__}'})


def idle_resource_worker():
    while not _stop.wait(5):
        try:
            if _hindsight_lifecycle is not None:
                stopped = _hindsight_lifecycle.stop_if_idle(memory_queues_idle)
                if stopped:
                    release_embedding_if_idle(force=True)
            release_embedding_if_idle()
        except Exception as error:
            print(f'[memory-idle] managed resource release pending ({type(error).__name__})', flush=True)


def main():
    if not TOKEN:
        raise SystemExit('Set MEMORY_BRIDGE_TOKEN in local .env before starting')
    DATA.mkdir(parents=True, exist_ok=True)
    config_file = DATA / 'memory-engine.json'
    engine = json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
    if engine.get('primary') == 'hindsight':
        get_hindsight_lifecycle()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    get_outbox()
    get_evidence_queue()
    kick_privacy_worker()
    threading.Thread(target=idle_resource_worker, daemon=True).start()
    threading.Thread(target=worker, daemon=True).start()
    threading.Thread(target=evidence_worker, daemon=True).start()
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
