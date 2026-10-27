"""Leased extraction tasks referencing the immutable QQ evidence journal."""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sqlite3
import time
import uuid
from privacy_ledger import PrivacyBlocked


class EvidenceQueue:
    def __init__(self, file, ledger=None):
        self.file = Path(file)
        self.ledger = ledger
        self.file.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1, 2, 3, 4):
                raise ValueError('Unsupported evidence schema')
            db.executescript((Path(__file__).parent / 'dsh-hymemory-plugin' / 'evidence-schema.sql').read_text(encoding='utf-8'))

    @contextmanager
    def connection(self, transaction=False):
        db = sqlite3.connect(self.file, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute('PRAGMA busy_timeout=10000')
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA synchronous=FULL')
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('PRAGMA secure_delete=ON')
            if transaction:
                db.execute('BEGIN IMMEDIATE')
            yield db
            if transaction:
                db.execute('COMMIT')
        except BaseException:
            if transaction and db.in_transaction:
                db.execute('ROLLBACK')
            raise
        finally:
            db.close()

    def _payload(self, db, job):
        event = db.execute('SELECT * FROM evidence_events WHERE id=? AND namespace=?', (job['source_event_id'], job['namespace'])).fetchone()
        barrier = db.execute('SELECT through_seq FROM evidence_barriers WHERE namespace=?', (job['namespace'],)).fetchone()
        cutoff = barrier[0] if barrier else 0
        privacy=self.ledger.state(job['namespace']) if self.ledger else dict(version=0,pending=False)
        blocked=self.ledger.blocked_sources(job['namespace']) if self.ledger else set()
        if event and event['id'] in blocked: raise PermissionError('Source deleted')
        if not event or not event['eligible'] or event['seq'] <= cutoff or event['state'] != ('received' if event['role'] == 'user' else 'accepted'):
            raise PermissionError('Source is not eligible')
        identity = dict(appId=event['app_id'], scope=event['scope'], peerId=event['peer_id'], senderId=event['actor_id'])
        messages, sources = [], []

        def append(row, start, end):
            content = row['text'][start:end]
            if row['role'] == 'user' and row['scope'] == 'group':
                encoded = json.dumps([row['app_id'], row['scope'], row['peer_id'], row['actor_id']], separators=(',', ':'), ensure_ascii=False)
                label = hashlib.sha256(encoded.encode()).hexdigest()[:12]
                content = f'本群成员-{label}说：\n{content}'
            messages.append({'role': row['role'], 'content': content})
            sources.append(dict(id=row['id'], role=row['role'], seq=row['seq'], start=start, end=end, actor_id=row['actor_id'], state=row['state'], source_time=row['source_time']))

        if event['role'] == 'assistant':
            related = json.loads(event['related_ids_json'])
            rows = []
            for source_id in related:
                row = db.execute('SELECT * FROM evidence_events WHERE id=? AND namespace=? AND role=\'user\'', (source_id, job['namespace'])).fetchone()
                if not row or row['seq'] <= cutoff:
                    raise PermissionError('Related source was forgotten or unavailable')
                if row['id'] in blocked: raise PermissionError('Related source deleted')
                rows.append(row)
            # Bounded, role-labelled immediate context; every original user span
            # also has its own task, so this bound cannot discard unique evidence.
            remaining, windows = 6000, []
            for row in sorted(rows, key=lambda r: r['seq'], reverse=True):
                length = len(row['text'])
                count = min(remaining, length)
                if count:
                    windows.append((row, length-count, length))
                    remaining -= count
            for row, start, end in reversed(windows):
                append(row, start, end)
        start, end = job['start_offset'], job['end_offset']
        if not 0 <= start < end <= len(event['text']) or end-start > 6000:
            raise PermissionError('Invalid source range')
        append(event, start, end)
        return dict(user_id=job['namespace'], identity=identity, scope=event['scope'], mode='chat', messages=messages, job_id=job['id'], session_id=event['session_id'] or 'evidence', message_id=event['platform_message_id'], evidence=dict(sources=sources, current_source_id=event['id'], delivery_state=event['state'], kind=event['kind'],privacy_version=privacy['version']))

    def claim(self, now=None):
        now = time.time() if now is None else now
        paused={r['namespace'] for r in self.ledger.operations(pending=True)} if self.ledger else set()
        with self.connection(transaction=True) as db:
            while True:
                excluded=','.join('?' for _ in paused)
                suffix=f' AND namespace NOT IN ({excluded})' if paused else ''
                row = db.execute("SELECT * FROM evidence_jobs WHERE ((status='pending' AND due<=?) OR (status='running' AND lease_until<=?))"+suffix+" ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END,due,source_event_id,start_offset,id LIMIT 1", (now,now,*sorted(paused))).fetchone()
                if not row:
                    return None
                job = dict(row)
                try:
                    job['payload'] = self._payload(db, job)
                except (PermissionError, ValueError, TypeError):
                    db.execute("UPDATE evidence_jobs SET status='blocked',error='InvalidSource',lease_token=NULL,lease_until=NULL WHERE id=?", (job['id'],))
                    continue
                job['lease_token'] = uuid.uuid4().hex
                job['attempts'] += 1
                db.execute("UPDATE evidence_jobs SET status='running',attempts=?,lease_token=?,lease_until=?,updated_at=? WHERE id=?", (job['attempts'], job['lease_token'], now+600, str(now), job['id']))
                return job

    def is_running(self, job):
        with self.connection() as db:
            row = db.execute("SELECT * FROM evidence_jobs WHERE id=? AND lease_token=? AND status='running'", (job['id'], job['lease_token'])).fetchone()
            if not row:
                return False
            try:
                self._payload(db, row)
                return True
            except PermissionError:
                return False

    def _finish(self, job, status, error=None, due=None):
        with self.connection(transaction=True) as db:
            return db.execute("UPDATE evidence_jobs SET status=?,error=?,due=COALESCE(?,due),lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND status='running'", (status, error, due, str(time.time()), job['id'], job['lease_token'])).rowcount == 1

    def done(self, job):
        return self._finish(job, 'done')

    def renew(self, job):
        with self.connection(transaction=True) as db:
            return db.execute("UPDATE evidence_jobs SET lease_until=? WHERE id=? AND lease_token=? AND status='running'", (time.time()+600, job['id'], job['lease_token'])).rowcount == 1

    def retry(self, job, error):
        return self._finish(job, 'pending', error, time.time()+min(300, 2**min(job['attempts'], 8)))

    def hold(self, job):
        return self._finish(job, 'blocked', 'PermissionRejected')

    def cancel_user(self, namespace):
        with self.connection(transaction=True) as db:
            cutoff = db.execute('SELECT COALESCE(MAX(seq),0) FROM evidence_events WHERE namespace=?', (namespace,)).fetchone()[0]
            db.execute('INSERT INTO evidence_barriers(namespace,through_seq) VALUES(?,?) ON CONFLICT(namespace) DO UPDATE SET through_seq=MAX(through_seq,excluded.through_seq)', (namespace, cutoff))
            db.execute("UPDATE evidence_jobs SET status='canceled',lease_token=NULL,lease_until=NULL,updated_at=? WHERE namespace=? AND status IN ('pending','running','blocked')", (str(time.time()), namespace))

    def cancel_sources(self, namespace, sources, erase=False):
        sources=set(sources)
        with self.connection(transaction=True) as db:
            for source in sources:
                db.execute("UPDATE evidence_jobs SET status='canceled',lease_token=NULL,lease_until=NULL,error=NULL WHERE namespace=? AND source_event_id=?",(namespace,source))
                db.execute('UPDATE evidence_events SET eligible=0 WHERE namespace=? AND id=?',(namespace,source))
                if erase:
                    db.execute("UPDATE evidence_events SET text='',raw_json='{}',state='erased' WHERE namespace=? AND id=?",(namespace,source))
                    db.execute("UPDATE evidence_deliveries SET receipt_json=NULL,error_class=NULL WHERE event_id=?",(source,))
            if erase:
                db.execute('PRAGMA secure_delete=ON')

    def sources_for_message(self, namespace, message_id):
        with self.connection() as db:
            return [r['id'] for r in db.execute("SELECT id FROM evidence_events WHERE namespace=? AND platform_message_id=? AND role='user'",(namespace,message_id))]

    def stats(self):
        with self.connection() as db:
            return {row['status']: row['n'] for row in db.execute('SELECT status,COUNT(*) n FROM evidence_jobs GROUP BY status')}
