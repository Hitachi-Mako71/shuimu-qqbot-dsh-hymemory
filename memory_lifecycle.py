"""Source-directed forgetting and stopped-service erasure adapters."""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import time

from evidence_queue import EvidenceQueue
from privacy_ledger import PrivacyLedger, PrivacyBlocked

SAFE_ID=re.compile(r'^[A-Za-z0-9_-]{1,128}$')
AGENT='qqbot-hymemory'


def sources_from_meta(value):
    result=set()
    if isinstance(value,list):
        for item in value: result.update(sources_from_meta(item))
    elif isinstance(value,dict):
        evidence=value.get('evidence')
        if isinstance(evidence,dict):
            result.update(s.get('id') for s in evidence.get('sources',[]) if isinstance(s,dict) and isinstance(s.get('id'),str))
        for key in ('custom','meta','client_meta'):
            if key in value: result.update(sources_from_meta(value[key]))
    return result


def safe_path(root, candidate):
    root=Path(root).absolute()
    candidate=Path(candidate).absolute()
    if candidate==root or not candidate.is_relative_to(root): raise PrivacyBlocked('Path outside deletion root')
    current=candidate
    while True:
        if current.exists():
            info=current.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info,'st_file_attributes',0)&0x400:
                raise PrivacyBlocked('Deletion refuses links')
        if current==root: break
        current=current.parent
    if not candidate.resolve().is_relative_to(root.resolve()): raise PrivacyBlocked('Resolved path escaped deletion root')
    return candidate


def remove(root, candidate):
    target=safe_path(root,candidate)
    if not target.exists(): return
    if target.is_dir():
        for base, dirs, names in os.walk(target,followlinks=False):
            for name in dirs+names: safe_path(root,Path(base)/name)
        shutil.rmtree(target)
    else: target.unlink()


def atomic_json(file, value):
    temporary=file.with_name(file.name+'.privacy.tmp')
    with temporary.open('w',encoding='utf-8') as stream:
        json.dump(value,stream,ensure_ascii=False)
        stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,file)


def dsh_project_key(cwd):
    raw=str(cwd).encode('utf-16-le');parts=[];separator=False
    for offset in range(0,len(raw),2):
        code=int.from_bytes(raw[offset:offset+2],'little');ch=chr(code)
        if ch in '/\\:':
            if not separator: parts.append('-')
            separator=True
        else:
            parts.append(ch if ch!='~' and re.fullmatch(r'[A-Za-z0-9._-]',ch) else '~'+format(code,'04X'))
            separator=False
    return '--'+(''.join(parts).lstrip('-') or 'root')[:251]+'--'


class MemoryLifecycle:
    def __init__(self, project, ledger=None, dsh_home=None, restored=False):
        self.project=Path(project).absolute()
        self.data=self.project/'data'
        self.ledger=ledger or PrivacyLedger(self.project/'.privacy/lifecycle.sqlite3')
        self.queue=EvidenceQueue(self.data/'evidence/qq-evidence.sqlite3',self.ledger)
        self.dsh_home=Path(dsh_home or os.environ.get('DSH_HOME',str(self.project.parent/'home'))).absolute()
        self.restored=restored

    def closure(self, namespace, ids):
        ids=set(ids)
        if not 1<=len(ids)<=100: raise ValueError('Choose 1 to 100 source IDs')
        with self.queue.connection() as db:
            rows=[dict(r) for r in db.execute('SELECT id,role,session_id,platform_message_id,related_ids_json,state FROM evidence_events WHERE namespace=?',(namespace,))]
            by_id={r['id']:r for r in rows}
            if not ids<=by_id.keys(): raise PrivacyBlocked('Source is not in this identity partition')
            if any(by_id[i]['state']=='erased' for i in ids): raise PrivacyBlocked('Original has already been erased')
            sessions={by_id[i]['session_id'] for i in ids if by_id[i]['session_id']}
            # Older replies only recorded immediate inputs. Retire all assistant
            # derivatives in affected sessions; retain unrelated USER originals.
            while True:
                linked={r['id'] for r in rows if r['role']=='assistant' and (set(json.loads(r['related_ids_json']))&ids or r['session_id'] in sessions)}
                if linked<=ids: break
                ids.update(linked)
            sessions.update(by_id[i]['session_id'] for i in ids if by_id[i]['session_id'])
            if sessions:
                marks=','.join('?' for _ in sessions)
                if db.execute(f'SELECT 1 FROM evidence_events WHERE session_id IN ({marks}) AND namespace!=? LIMIT 1',(*sorted(sessions),namespace)).fetchone():
                    raise PrivacyBlocked('A shared legacy session requires manual redaction')
            return dict(source_ids=sorted(ids),session_ids=sorted(sessions),message_ids=sorted({by_id[i]['platform_message_id'] for i in ids if by_id[i]['role']=='user' and by_id[i]['platform_message_id']}))

    def recent(self, namespace):
        with self.queue.connection() as db:
            return [dict(r) for r in db.execute("SELECT id,role,kind,state,source_time,recorded_at FROM evidence_events WHERE namespace=? AND role='user' ORDER BY seq DESC LIMIT 8",(namespace,))]

    def preview(self, identity, namespace, ids):
        if self.ledger.state(namespace)['pending']: raise PrivacyBlocked('Finish current cleanup before another deletion')
        plan=self.closure(namespace,ids)
        key=dsh_project_key(self.data/'workspaces'/namespace)
        if not key.endswith(namespace+'--'): raise PrivacyBlocked('Session path grouping is truncated; explicit adapter required')
        plan.update(identity=identity,namespace=namespace,base_version=self.ledger.state(namespace)['version'],memory_ids=[],session_project_key=key,workspace_scope='entire_current_identity',index_scope='entire_current_identity_and_rebuild_retained_user_evidence')
        token=self.ledger.preview(namespace,identity['senderId'],plan)
        return dict(token=token,source_count=len(plan['source_ids']),session_count=len(plan['session_ids']),workspace_scope=plan['workspace_scope'],index_scope=plan['index_scope'],expires_seconds=600)

    def confirm(self, identity, namespace, token):
        operation=self.ledger.confirm(namespace,identity['senderId'],token)
        self.queue.cancel_sources(namespace,operation['plan']['source_ids'])
        self.cancel_legacy(operation)
        return operation

    def forget(self, identity, namespace, memory):
        ids=sources_from_meta(memory)
        message_id=memory.get('message_id')
        for meta in memory.get('meta',[]) if isinstance(memory.get('meta'),list) else []:
            if isinstance(meta,dict) and meta.get('message_id'): message_id=meta['message_id']
        if message_id: ids.update(self.queue.sources_for_message(namespace,message_id))
        plan=self.closure(namespace,ids) if ids else dict(source_ids=[],session_ids=[],message_ids=[])
        identifier=memory.get('id') or memory.get('memory_id') or memory.get('node_id')
        if not isinstance(identifier,str) or not identifier: raise ValueError('Missing memory ID')
        plan.update(identity=identity,namespace=namespace,memory_ids=[identifier],legacy_unattributed=not bool(ids))
        operation=self.ledger.commit(namespace,'forget',plan)
        self.queue.cancel_sources(namespace,plan['source_ids'])
        self.cancel_legacy(operation)
        return operation

    def cancel_legacy(self, operation):
        file=self.data/'outbox.sqlite3'
        if not file.exists(): return
        plan=operation['plan'];messages=set(plan.get('message_ids',[]))
        with closing(sqlite3.connect(file,timeout=10)) as db:
            with db:
                for id,payload,status in db.execute('SELECT id,payload,status FROM jobs WHERE user_id=?',(operation['namespace'],)).fetchall():
                    if status not in ('pending','running','blocked'): continue
                    body=json.loads(payload)
                    if body.get('message_id') in messages or sources_from_meta(body)&set(plan['source_ids']):
                        db.execute("UPDATE jobs SET status='canceled',payload='{}',error=NULL WHERE id=?",(id,))
                    elif plan.get('legacy_unattributed'):
                        db.execute("UPDATE jobs SET status='blocked',error='UnattributedDeletionReview' WHERE id=?",(id,))

    def retire_caches(self, namespace):
        for name in (f'companion/people/{namespace}.json',f'companion/groups/rooms/{namespace}.json',f'qq-media/{namespace}.json'):
            path=self.data/name
            remove(self.data,path)

    def erase_originals(self, operation):
        namespace=operation['namespace'];plan=operation['plan']
        # Timetable is an explicit local authority, not a semantic-memory cache.
        # Physical erasure clears this identity's current/previous/pending data.
        # Logical memory forgetting deliberately leaves confirmed courses intact.
        self.erase_timetable(namespace)
        self.queue.cancel_sources(namespace,plan['source_ids'],erase=True)
        # Drop outgoing copies and lineage that contain the erased source text.
        with self.queue.connection(transaction=True) as db:
            db.execute('DELETE FROM history_episodes WHERE namespace=?',(namespace,))
            db.execute('DELETE FROM context_initializations WHERE namespace=?',(namespace,))
            db.execute('DELETE FROM context_requests WHERE namespace=?',(namespace,))
            for source in plan['source_ids']:
                db.execute('DELETE FROM evidence_artifacts WHERE namespace=? AND event_id=?',(namespace,source))
        self.retire_caches(namespace)

    def erase_timetable(self, namespace):
        if not re.fullmatch(r'qq-[a-f0-9]{64}',namespace):
            raise PrivacyBlocked('Canonical timetable partition required')
        root=self.data/'timetables'
        remove(self.data,root/(namespace+'.json'))
        if root.exists():
            for file in root.glob(namespace+'.json.*.tmp'):
                remove(self.data,file)

    def erase_workspace(self, operation):
        root=self.data/'workspaces';target=root/operation['namespace']
        remove(root,target)

    def erase_image_tasks(self, operation):
        root=self.data/'codex-images';file=root/'images-state.json'
        if not file.exists(): return
        data=json.loads(file.read_text(encoding='utf-8-sig'))
        changed=False
        from qq_identity import namespace as namespace_of
        config_path=root/'config.json'
        config=json.loads(config_path.read_text(encoding='utf-8-sig')) if config_path.exists() else {}
        for job in data.get('jobs',[]):
            identity=job.get('identity') or {}
            if not all(k in identity for k in ('appId','scope','peerId')) or namespace_of(identity)!=operation['namespace']: continue
            if job.get('target',{}).get('msgId') not in set(operation['plan']['message_ids']): continue
            identifier=job.get('id')
            if not isinstance(identifier,str) or not SAFE_ID.fullmatch(identifier): raise PrivacyBlocked('Invalid image job ID')
            # Preserve a minimal cancellation tombstone, never the deleted prompt.
            job.clear();job.update(id=identifier,status='canceled',reason='source-deleted',identity=identity)
            changed=True
            if not self.restored:
                if not config.get('imageRoot'): raise PrivacyBlocked('Image artifact root unknown')
                remove(Path(config['imageRoot']),Path(config['imageRoot'])/identifier)
        if changed: atomic_json(file,data)

    def erase_sessions(self, operation):
        root=self.dsh_home/'sessions'
        sessions=set(operation['plan'].get('session_ids',[]))
        key=operation['plan'].get('session_project_key')
        if key:
            if not key.endswith(operation['namespace']+'--') or Path(key).name!=key: raise PrivacyBlocked('Invalid scoped session project')
            folder=root/key
            if folder.exists():
                safe_path(root,folder)
                sessions.update(p.name for p in folder.iterdir() if p.is_dir() and SAFE_ID.fullmatch(p.name))
                remove(root,folder)
        for session in sessions:
            if not SAFE_ID.fullmatch(session): raise PrivacyBlocked('Invalid session artifact ID')
            if root.exists():
                for group in root.iterdir():
                    safe_path(root,group)
                    if group.is_dir(): remove(root,group/session)
            projections=self.dsh_home/'storages/session_projcache/sessions'
            if projections.exists():
                for candidate in projections.glob(session+'.json*'): remove(projections,candidate)

    def sanitize_exports(self, operation):
        root=self.project/'exports';namespace=operation['namespace']
        if not root.exists(): return
        for file in root.iterdir():
            safe_path(root,file)
            if not file.is_file() or file.suffix.lower()!='.json':
                raise PrivacyBlocked('Unsupported export needs a deletion adapter')
            data=json.loads(file.read_text(encoding='utf-8-sig'))
            if data.get('format')!='qqbot-hymemory-active-facts':
                # Unknown exports are retained and explicitly block completion.
                raise PrivacyBlocked('Unsupported export format requires a deletion adapter')
            changed=False
            for partition in data.get('partitions',[]):
                if partition.get('namespace')!=namespace: continue
                old=partition.get('memories',[])
                partition['memories']=[] if operation['mode']=='erase' else [m for m in old if (m.get('node_id') or m.get('memory_id') or m.get('id')) not in set(operation['plan']['memory_ids']) and not sources_from_meta(m)&set(operation['plan']['source_ids'])]
                partition['memory_count']=len(partition['memories']);changed=changed or old!=partition['memories']
            if changed:
                data['memory_count']=sum(len(p.get('memories',[])) for p in data.get('partitions',[]))
                data['privacy_revision_applied']=operation['version']
                atomic_json(file,data)

    def rebuild_retained_user_tasks(self, operation):
        # A physical erase rebuilds semantic projections only from retained user
        # originals. It never synthesizes missing history or replays QQ sends.
        with self.queue.connection(transaction=True) as db:
            db.execute("UPDATE evidence_jobs SET status='pending',lease_token=NULL,lease_until=NULL,due=?,error=NULL WHERE namespace=? AND status='done' AND source_event_id IN (SELECT id FROM evidence_events WHERE namespace=? AND role='user' AND eligible=1 AND state='received')",(time.time()+2,operation['namespace'],operation['namespace']))

    def erase_logs(self):
        # Shared diagnostic logs can lack source attribution. The confirmation
        # explicitly includes clearing these disposable managed logs.
        for root in (self.project/'logs',self.data/'hy-memory/logs'):
            if root.exists():
                for entry in root.iterdir(): remove(root,entry)

    def apply(self, operation, adapter):
        """Called with BOTH managed services stopped, never on a live Agent."""
        namespace=operation['namespace']
        try:
            self.queue.cancel_sources(namespace,operation['plan']['source_ids'])
            self.cancel_legacy(operation)
            adapter.delete(operation)
            self.retire_caches(namespace)
            self.sanitize_exports(operation)
            if operation['mode']=='erase':
                self.erase_originals(operation)
                self.erase_workspace(operation)
                self.erase_sessions(operation)
                self.erase_image_tasks(operation)
                adapter.erase_auxiliary(operation)
                self.erase_logs()
                self.rebuild_retained_user_tasks(operation)
            elif getattr(adapter,'rebuild_on_forget',False):
                self.rebuild_retained_user_tasks(operation)
            self.ledger.update(operation,'complete')
        except Exception as error:
            self.ledger.update(operation,'blocked',type(error).__name__)
            raise

    def status(self, namespace):
        return dict(**self.ledger.state(namespace),operations=[dict(id=r['id'],mode=r['mode'],status=r['status'],error=r['error']) for r in self.ledger.operations(namespace)])


class LocalHyDeletionAdapter:
    """Pinned pro/lite local Chroma adapter; no LLM or network requests."""
    def __init__(self, project, persist=None):
        self.project=Path(project).absolute()
        from hy_memory.config import MemoryConfig
        self.config=MemoryConfig.from_env()
        config=self.config.vector_store
        if config.provider!='chroma' or config.host or os.environ.get('MEMORY_MODE','pro') not in ('pro','lite'):
            raise PrivacyBlocked('Deletion adapter requires local pro/lite Chroma')
        if self.config.enable_graph:
            raise PrivacyBlocked('Graph deletion adapter is not enabled')
        self.persist=Path(persist or config.persist_directory).absolute()
        if not self.persist.resolve().is_relative_to((self.project/'data/hy-memory').resolve()):
            raise PrivacyBlocked('Index is outside the supported managed data root')
        self.name=config.collection_name+(f'_{config.embedding_dims}' if config.embedding_dims else '')
        self._collection=None

    def collection(self):
        if not (self.persist/'chroma.sqlite3').exists(): return None
        if self._collection is None:
            import chromadb
            self._collection=chromadb.PersistentClient(path=str(self.persist)).get_collection(name=self.name)
        return self._collection

    def delete(self, operation):
        collection=self.collection()
        if collection is None: return
        from hy_memory.data.vector_store_chroma import ChromaVectorStore
        namespace=operation['namespace'];plan=operation['plan']
        targets=[];offset=0
        while True:
            page=collection.get(where={'user_id':namespace},include=['metadatas'],limit=500,offset=offset)
            ids=page.get('ids',[])
            if not ids: break
            for identifier, metadata in zip(ids,page['metadatas']):
                value=ChromaVectorStore._chroma_metadata_to_payload(metadata or {})
                if value.get('user_id')!=namespace: raise PrivacyBlocked('Index owner mismatch')
                if value.get('agent_id')!=AGENT and value.get('layer')!='l0_basic_info': continue
                memory_id=value.get('node_id') or identifier
                selected=operation['mode']=='erase' or memory_id in set(plan['memory_ids']) or bool(sources_from_meta(value)&set(plan['source_ids']))
                if selected: targets.append(identifier)
            offset+=len(ids)
        for start in range(0,len(targets),500): collection.delete(ids=targets[start:start+500])

    def erase_auxiliary(self, operation):
        namespace=operation['namespace']
        root=self.project/'data/hy-memory'
        if not root.exists(): return
        # Chroma's own files are managed only through its supported API.
        for file in list(root.rglob('*.sqlite3'))+list(root.rglob('*.sqlite'))+list(root.rglob('*.db')):
            safe_path(root,file)
            if file.is_relative_to(self.persist): continue
            with closing(sqlite3.connect(file,timeout=10)) as db:
                db.execute('PRAGMA secure_delete=ON')
                tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
                with db:
                    for table in tables:
                        if not re.fullmatch(r'[A-Za-z0-9_]+',table): raise PrivacyBlocked('Unrecognized auxiliary table')
                        columns={r[1] for r in db.execute(f'PRAGMA table_info("{table}")')}
                        owner=next((key for key in ('user_id','uid') if key in columns),None)
                        if owner:
                            db.execute(f'DELETE FROM "{table}" WHERE "{owner}"=?',(namespace,))
                        elif 'isolation_key' in columns:
                            db.execute(f'DELETE FROM "{table}" WHERE isolation_key=? OR isolation_key LIKE ? ESCAPE \'!\'',(namespace,namespace+'::%'))
                        elif table in ('llm_cache','embedding_cache','cache'):
                            # Disposable shared caches have no owner index.
                            db.execute(f'DELETE FROM "{table}"')
                        elif 'memory_id' in columns and operation['plan']['memory_ids']:
                            for memory in operation['plan']['memory_ids']: db.execute(f'DELETE FROM "{table}" WHERE memory_id=?',(memory,))
                        elif table not in ('system_metrics','sqlite_sequence') and columns & {'content','payload','messages','response','prompt','old_memory','new_memory'}:
                            raise PrivacyBlocked('Auxiliary content needs a scoped deletion adapter')
                db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        # Content trace files are disabled in the supported profile. Refuse a
        # false "complete" if a deployment enabled an unimplemented trace sink.
        if os.environ.get('MEMORY_PIPELINE_TRACE_ENABLED','false').lower()=='true':
            raise PrivacyBlocked('Content trace deletion adapter required')


class HindsightDeletionAdapter:
    """Delete the entire affected projection, then rebuild only retained user evidence."""
    rebuild_on_forget=True
    def __init__(self,project):
        from dotenv import dotenv_values
        from hindsight_adapter import HindsightAdapter
        self.legacy=LocalHyDeletionAdapter(project)
        self.client=HindsightAdapter(dotenv_values(Path(project)/'.env')['MEMORY_BRIDGE_TOKEN'])
    def delete(self,operation):
        self.legacy.delete(operation)
        # Full bank deletion also removes dependent observations, chunks and history.
        # The canonical namespace is validated again inside the adapter.
        result=self.client.delete_bank(operation['namespace'])
        if not isinstance(result,dict) or result.get('success') is not True:
            raise PrivacyBlocked('Hindsight did not confirm scoped deletion')
    def erase_auxiliary(self,operation):
        self.legacy.erase_auxiliary(operation)


def apply_pending(project, dsh_home=None):
    project=Path(project).absolute()
    if (project/'.run/services.json').exists():
        raise PrivacyBlocked('Stop both managed services before applying deletion')
    lifecycle=MemoryLifecycle(project,dsh_home=dsh_home)
    pending=lifecycle.ledger.operations(pending=True)
    if not pending: return dict(completed=0,blocked=0)
    engine_file=project/'data/memory-engine.json'
    config=json.loads(engine_file.read_text(encoding='utf-8')) if engine_file.exists() else {}
    adapter=HindsightDeletionAdapter(project) if config.get('primary')=='hindsight' else LocalHyDeletionAdapter(project)
    completed=blocked=0
    for operation in pending:
        try: lifecycle.apply(operation,adapter);completed+=1
        except Exception: blocked+=1
    with lifecycle.queue.connection() as db:
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    return dict(completed=completed,blocked=blocked)


if __name__=='__main__':
    import argparse
    from dotenv import load_dotenv
    parser=argparse.ArgumentParser()
    parser.add_argument('--project',type=Path,required=True)
    parser.add_argument('--dsh-home',type=Path)
    args=parser.parse_args()
    load_dotenv(args.project/'.env',override=True)
    os.chdir(args.project)
    print(json.dumps(apply_pending(args.project,args.dsh_home)))
