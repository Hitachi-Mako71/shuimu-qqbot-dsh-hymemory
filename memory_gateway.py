"""V2.3 single-primary memory contract. Lifecycle authority stays outside engines."""
from importlib.metadata import version
import json
import math
import re
import time
from privacy_ledger import PrivacyBlocked
from hindsight_adapter import HindsightAdapter

AGENT='qqbot-hymemory'

def normalize_memories(result,user_id=None):
    rows=[]
    if isinstance(result,list):rows.extend(('chat',item) for item in result)
    elif isinstance(result,dict):
        rows.extend(('vdb',item) for item in result.get('vdb',{}).get('memories',[]))
        memories=result.get('memories',{})
        if isinstance(memories,list):rows.extend(('chat',item) for item in memories)
        elif isinstance(memories,dict):
            for bucket,items in memories.items():
                if isinstance(items,list):rows.extend((bucket,item) for item in items)
    normalized=[];seen=set()
    for channel,item in rows:
        if not isinstance(item,dict):continue
        if user_id and (item.get('user_id') not in (None,user_id) or item.get('agent_id') not in (None,AGENT)):continue
        id=item.get('memory_id') or item.get('id');content=item.get('content') or item.get('text')
        if not isinstance(id,str) or not id or not content or id in seen:continue
        seen.add(id);score=item.get('score')
        normalized.append(dict(id=id,content=str(content)[:1600],layer=item.get('layer',''),source=item.get('source','qqbot-dsh'),channel=channel,score=score if isinstance(score,(int,float)) and math.isfinite(score) else None,session_id=item.get('session_id'),meta=item.get('meta',[])))
    return normalized

def actual_usage(result):
    usage=result.get('usage') if isinstance(result,dict) else None
    if not isinstance(usage,dict):return None
    # Preserve only real finite nonnegative measurements; absent never means zero.
    return {k:v for k,v in usage.items() if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and v>=0} or None

class HyMemoryAdapter:
    name='hy-memory'
    def __init__(self,client_factory):self.client_factory=client_factory
    def recall(self,namespace,query,limit):
        raw=self.client_factory().search(query,scene='chat',user_ids=[namespace],agent_ids=[AGENT],include_sources=['qqbot-dsh'],limit=limit)
        return normalize_memories(raw,namespace),actual_usage(raw)
    def list(self,namespace,limit):
        raw=self.client_factory().list_memories(user_id=namespace,agent_id=AGENT,limit=limit)
        return normalize_memories(raw,namespace),actual_usage(raw)
    def retain(self,namespace,data,*,session_id,request_id,meta):
        raw=self.client_factory().add(data,scene='chat',user_id=namespace,agent_id=AGENT,session_id=session_id,source='qqbot-dsh',request_id=request_id,meta=meta)
        if not isinstance(raw,dict) or raw.get('success') is not True:raise RuntimeError('Memory engine did not confirm retention')
        return dict(success=True,request_id=raw.get('request_id'),usage=actual_usage(raw))
    def get(self,namespace,id):
        value=self.client_factory().get(id)
        if not isinstance(value,dict) or value.get('user_id')!=namespace or value.get('agent_id')!=AGENT:return None
        return value

class MemoryGateway:
    contract_version=1
    def __init__(self,adapter,ledger,history=None):
        if not isinstance(adapter,(HyMemoryAdapter,HindsightAdapter)):raise ValueError('Verified memory adapter required')
        self.adapter=adapter;self.ledger=ledger;self.history=history
    def _scope(self,namespace):
        if not isinstance(namespace,str) or not re.fullmatch(r'qq-[a-f0-9]{64}',namespace):raise PermissionError('Canonical memory partition required')
        state=self.ledger.state(namespace)
        if state['pending']:raise PrivacyBlocked('Deletion cleanup pending')
        return state
    def _read(self,namespace,action):
        state=self._scope(namespace);start=time.perf_counter()
        memories,usage=action()
        # Fence results against deletion committed while the engine was reading.
        with self.ledger.write_guard(namespace,state['version']):
            filtered=[]
            from memory_lifecycle import sources_from_meta
            blocked=self.ledger.blocked_sources(namespace)
            for memory in memories:
                if self.ledger.memory_blocked(namespace,memory['id']) or sources_from_meta(memory)&blocked:continue
                filtered.append(memory)
            return dict(memories=filtered,usage=usage,engine=self.adapter.name,contract_version=1,privacy_version=state['version'],elapsed_ms=round((time.perf_counter()-start)*1000,3))
    def recall(self,namespace,query,limit=6):
        self._scope(namespace)
        if not isinstance(query,str) or not query.strip() or len(query)>4000:raise ValueError('Query must contain at most 4000 characters')
        return self._read(namespace,lambda:self.adapter.recall(namespace,query,max(1,min(int(limit),20))))
    def list(self,namespace,limit=30):return self._read(namespace,lambda:self.adapter.list(namespace,max(1,min(int(limit),30))))
    def retain(self,namespace,data,*,session_id,request_id,meta,expected_version,source_ids):
        self._scope(namespace)
        if isinstance(data,str):data=[dict(role='user',content=data)]
        if not isinstance(data,list) or not data or len(data)>128 or any(not isinstance(m,dict) or m.get('role') not in ('user','assistant','system') or not isinstance(m.get('content'),str) for m in data):raise ValueError('Role-preserving text messages required')
        if len(json.dumps([data,meta],ensure_ascii=False).encode('utf-8'))>1000000:raise ValueError('Retention payload exceeds gateway budget')
        if not isinstance(source_ids,list) or len(source_ids)>4096 or not all(isinstance(i,str) for i in source_ids):raise ValueError('Bounded provenance required')
        with self.ledger.write_guard(namespace,expected_version,source_ids):
            return self.adapter.retain(namespace,data,session_id=str(session_id)[:256],request_id=request_id,meta=json.loads(json.dumps(meta)))
    def get(self,namespace,id):
        state=self._scope(namespace)
        if not isinstance(id,str) or not 1<=len(id)<=256:raise ValueError('Memory ID required')
        result=self.adapter.get(namespace,id)
        with self.ledger.write_guard(namespace,state['version']):
            from memory_lifecycle import sources_from_meta
            return None if self.ledger.memory_blocked(namespace,id) or self.ledger.source_blocked(namespace,sources_from_meta(result)) else result
    def recall_sources(self,namespace,ids):
        self._scope(namespace)
        if self.history is None:raise RuntimeError('Original evidence adapter unavailable')
        return self.history.expand(namespace,ids)
    def recall_history(self,namespace,query,**options):
        self._scope(namespace)
        if self.history is None:raise RuntimeError('Original evidence adapter unavailable')
        return self.history.search(namespace,query,**options)
    def request_forget(self,namespace,identity,id,lifecycle):
        memory=self.get(namespace,id)
        if memory is None:return None
        memory={**memory,'id':id}
        return lifecycle.forget(identity,namespace,memory)
    def agreements(self,namespace):
        self._scope(namespace)
        if self.history is None:raise RuntimeError('Episode evidence adapter unavailable')
        return self.history.episodes(namespace)
    def save_agreement(self,namespace,actor,source_id,*,supersedes=None):
        self._scope(namespace)
        if self.history is None:raise RuntimeError('Episode evidence adapter unavailable')
        return self.history.save_episode(namespace,actor,source_id,supersedes=supersedes)
    def info(self):
        return dict(contract_version=1,engine=self.adapter.name,engine_version=getattr(self.adapter,'engine_version',None) or version('hy-memory'),single_primary=True,gateway_retries=0,originals_owner='independent-evidence-journal',deletion_owner='independent-privacy-authority',engine_migration_enabled=self.adapter.name=='hindsight')
