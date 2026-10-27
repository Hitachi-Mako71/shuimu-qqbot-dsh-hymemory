"""Bounded, identity-scoped historical recall over original QQ evidence."""
from datetime import datetime, timezone, timedelta
import hashlib
import json
import re
from privacy_ledger import PrivacyBlocked

STOP={'什么','怎么','我们','你们','那个','那件','件事','上次','之前','原话','时候','后来','一次','第一','记得','说过','提过','记录','查找','历史','一下','就是','的是','的是','了吗','了什','么时','我说','你说','到底','当时','约好','约定'}

def terms(text):
    result=[]
    for part in re.findall(r'[a-zA-Z0-9_]{2,}|[\u3400-\u9fff]{2,}',text.lower()[:1000]):
        if re.fullmatch(r'[\u3400-\u9fff]+',part):result.extend(part[i:i+2] for i in range(len(part)-1))
        else:result.append(part)
    return list(dict.fromkeys(t for t in result if t not in STOP))[:32]

def instant(value):
    if value is None:return None
    try:
        if re.fullmatch(r'\d{10,13}(?:\.\d+)?',str(value)):
            number=float(value);return datetime.fromtimestamp(number/1000 if number>1e11 else number,timezone.utc)
        parsed=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (ValueError,OverflowError,OSError):return None

def classify(row):
    if row['role']=='user':return 'user-statement'
    return 'external-report-unverified' if re.search(r'https?://',row['text']) else 'model-observation'

class HistoryRecall:
    def __init__(self,queue,ledger):self.queue=queue;self.ledger=ledger

    def _state(self,namespace):
        state=self.ledger.state(namespace)
        if state['pending']:raise PrivacyBlocked('Deletion cleanup pending')
        return state,self.ledger.blocked_sources(namespace)

    def _allowed(self,row,blocked):
        return row and row['id'] not in blocked and row['state']!='erased' and not set(json.loads(row['related_ids_json']))&blocked and (row['role']=='user' or row['state']=='accepted')

    def _source(self,row,query='',maximum=1200):
        start=0
        for term in terms(query):
            at=row['text'].lower().find(term)
            if at>=0:start=max(0,at-160);break
        end=min(len(row['text']),start+maximum)
        return dict(id=row['id'],role=row['role'],actor_id=row['actor_id'],time=row['source_time'] or row['recorded_at'],text=row['text'][start:end],start=start,end=end,total_chars=len(row['text']),complete=start==0 and end==len(row['text']),kind=classify(row),state=row['state'])

    def expand(self,namespace,ids):
        if not isinstance(ids,list) or not 1<=len(ids)<=6 or not all(isinstance(i,str) and len(i)<=128 for i in ids):raise ValueError('Choose up to six source IDs')
        state,blocked=self._state(namespace)
        with self.queue.connection() as db:
            rows=[db.execute('SELECT * FROM evidence_events WHERE namespace=? AND id=?',(namespace,i)).fetchone() for i in dict.fromkeys(ids)]
        if any(r is None for r in rows):raise PermissionError('Source is outside this identity')
        if any(not self._allowed(r,blocked) for r in rows):raise PrivacyBlocked('Source unavailable')
        with self.ledger.write_guard(namespace,state['version'],ids):
            return dict(sources=[self._source(r,maximum=2000) for r in rows],privacy_version=state['version'])

    def search(self,namespace,query,*,current_message_id,semantic=(),from_time=None,to_time=None,actor_id=None):
        if not isinstance(query,str) or not query.strip() or len(query)>1000:raise ValueError('Bounded query required')
        state,blocked=self._state(namespace)
        with self.queue.connection() as db:
            current=db.execute("SELECT seq FROM evidence_events WHERE namespace=? AND platform_message_id=? AND role='user'",(namespace,current_message_id)).fetchone()
            if current is None:return dict(sources=[],episodes=[],coverage=dict(claim='available-records-only',reason='no-current-source'),privacy_version=state['version'])
            rows=[dict(r) for r in db.execute('SELECT * FROM evidence_events WHERE namespace=? AND seq<? ORDER BY seq DESC LIMIT 5000',(namespace,current['seq']))]
        # The scan is bounded by rows and text bytes. Never load the entire archive into the model.
        kept=[];size=0
        for row in rows:
            size+=len(row['text'].encode('utf-8'))
            if size>8*1024*1024:break
            kept.append(row)
        rows=kept
        reference=datetime.now(timezone.utc)
        lower=instant(from_time);upper=instant(to_time)
        if from_time and lower is None or to_time and upper is None:raise ValueError('Invalid ISO time filter')
        if not from_time and not to_time:
            if '昨天' in query:lower=(reference-timedelta(days=1)).replace(hour=0,minute=0,second=0,microsecond=0);upper=lower+timedelta(days=1)
            elif '今天' in query:lower=reference.replace(hour=0,minute=0,second=0,microsecond=0);upper=lower+timedelta(days=1)
        query_terms=terms(query)
        if re.search(r'那件|那个|上次|刚才|后来|之前',query):
            recent=[r for r in rows if r['role']=='user' and r['eligible'] and self._allowed(r,blocked)][:3]
            query_terms=list(dict.fromkeys(query_terms+[t for r in recent for t in terms(r['text'])]))[:48]
        semantic_ids=set()
        def collect(value):
            if isinstance(value,list):
                for child in value:collect(child)
            elif isinstance(value,dict):
                for source in value.get('evidence',{}).get('sources',[]):
                    if isinstance(source,dict) and isinstance(source.get('id'),str):semantic_ids.add(source['id'])
                for key in ('meta','custom','client_meta'):
                    if key in value:collect(value[key])
        collect(semantic)
        ranked=[]
        for row in rows:
            if not row['eligible'] or not self._allowed(row,blocked):continue
            when=instant(row['source_time']) or instant(row['recorded_at'])
            if lower and (not when or when<lower) or upper and (not when or when>=upper):continue
            if actor_id and row['actor_id']!=actor_id:continue
            score=sum(1 for term in query_terms if term in row['text'].lower())+(3 if row['id'] in semantic_ids else 0)
            if score:ranked.append((score,row))
        first=bool(re.search(r'第一次|最早|首次',query))
        ranked.sort(key=(lambda pair:pair[1]['seq']) if first else (lambda pair:(-pair[0],-pair[1]['seq'])))
        chosen=sorted([r for _,r in ranked[:6]],key=lambda r:r['seq'])
        sources=[self._source(r,query,maximum=900) for r in chosen]
        episodes=self.episodes(namespace)
        relevant=[e for e in episodes if any(t in e['text'] for t in query_terms) or re.search('约定|约好|答应',query)][:4]
        with self.ledger.write_guard(namespace,state['version'],[r['id'] for r in chosen]):
            return dict(sources=sources,episodes=relevant,privacy_version=state['version'],coverage=dict(claim='available-records-only',scan_rows=len(rows),max_rows=5000,time_basis='UTC',lower=lower.isoformat() if lower else None,upper_exclusive=upper.isoformat() if upper else None,first_available_only=first),interpretation=dict(query_terms=query_terms,semantic_sources_validated=True,ordinary_chat_requires_no_history_search=True))

    def save_episode(self,namespace,actor,source_id,*,supersedes=None):
        state,blocked=self._state(namespace)
        with self.ledger.write_guard(namespace,state['version'],[source_id]):
            with self.queue.connection(transaction=True) as db:
                row=db.execute("SELECT * FROM evidence_events WHERE namespace=? AND id=? AND role='user'",(namespace,source_id)).fetchone()
                if row is None or row['actor_id']!=actor:raise PermissionError('Episode needs the current actor original')
                if not self._allowed(row,blocked):raise PrivacyBlocked('Source unavailable')
                if supersedes:
                    old=db.execute('SELECT * FROM history_episodes WHERE namespace=? AND id=?',(namespace,supersedes)).fetchone()
                    if not old or old['actor_id']!=actor:raise PermissionError('Cannot revise another actor episode')
                    match=re.fullmatch(r'更正约定\s*[:：]\s*'+re.escape(supersedes)+r'\s+(.+)',row['text'],re.S)
                else:match=re.fullmatch(r'约定\s*[:：]\s*(.+)',row['text'],re.S)
                if not match or len(match[1])>1500:raise ValueError('Explicit bounded agreement text required')
                id=hashlib.sha256((namespace+source_id).encode()).hexdigest()[:32]
                now=datetime.now(timezone.utc).isoformat()
                db.execute('INSERT OR IGNORE INTO history_episodes VALUES(?,?,?,?,?,?,?,?,?,?,?)',(id,namespace,actor,'agreement','user-stated',json.dumps([source_id]),match[1],row['source_time'] or row['recorded_at'],None,supersedes,now))
                if supersedes:db.execute('UPDATE history_episodes SET valid_to=? WHERE namespace=? AND id=?',(row['source_time'] or row['recorded_at'],namespace,supersedes))
                return dict(id=id,kind='agreement',status='user-stated',supersedes=supersedes,source_ids=[source_id],text=match[1])

    def episodes(self,namespace):
        _,blocked=self._state(namespace)
        with self.queue.connection() as db:
            result=[]
            for row in db.execute('SELECT * FROM history_episodes WHERE namespace=? AND valid_to IS NULL ORDER BY created_at DESC LIMIT 40',(namespace,)):
                item=dict(row);ids=json.loads(item.pop('source_ids_json'))
                if set(ids)&blocked:continue
                originals=[db.execute('SELECT * FROM evidence_events WHERE namespace=? AND id=?',(namespace,i)).fetchone() for i in ids]
                if all(self._allowed(r,blocked) for r in originals):item['source_ids']=ids;result.append(item)
            return result
