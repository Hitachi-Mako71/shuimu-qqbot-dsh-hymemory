"""V1.3 monotonic deletion authority. Never replace it from an old backup."""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
import time
import uuid


class PrivacyBlocked(PermissionError):
    pass


class PrivacyLedger:
    def __init__(self, file):
        self.file = Path(file)
        self.file.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            if db.execute('PRAGMA user_version').fetchone()[0] not in (0, 1):
                raise RuntimeError('Unsupported privacy authority')
            db.executescript('''
            CREATE TABLE IF NOT EXISTS privacy_spaces(namespace TEXT PRIMARY KEY,version INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS privacy_operations(id TEXT PRIMARY KEY,namespace TEXT NOT NULL,version INTEGER NOT NULL,mode TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL,error TEXT,created REAL NOT NULL,updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS privacy_sources(namespace TEXT NOT NULL,source_id TEXT NOT NULL,version INTEGER NOT NULL,mode TEXT NOT NULL,PRIMARY KEY(namespace,source_id));
            CREATE TABLE IF NOT EXISTS privacy_memories(namespace TEXT NOT NULL,memory_id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(namespace,memory_id));
            CREATE TABLE IF NOT EXISTS privacy_confirmations(token_hash TEXT PRIMARY KEY,namespace TEXT NOT NULL,actor TEXT NOT NULL,plan TEXT NOT NULL,expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS privacy_authority(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            PRAGMA user_version=1;
            ''')
            db.execute('INSERT OR IGNORE INTO privacy_authority VALUES(?,?)',('id',uuid.uuid4().hex))

    def authority_id(self):
        with self.db() as db: return db.execute("SELECT value FROM privacy_authority WHERE key='id'").fetchone()[0]

    @contextmanager
    def db(self, write=False):
        db=sqlite3.connect(self.file, timeout=180, isolation_level=None)
        db.row_factory=sqlite3.Row
        try:
            db.execute('PRAGMA busy_timeout=180000')
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA synchronous=FULL')
            db.execute('PRAGMA secure_delete=ON')
            if write: db.execute('BEGIN IMMEDIATE')
            yield db
            if write: db.execute('COMMIT')
        except BaseException:
            if db.in_transaction: db.execute('ROLLBACK')
            raise
        finally: db.close()

    def state(self, namespace, db=None):
        if db is None:
            with self.db() as connection: return self.state(namespace, connection)
        row=db.execute('SELECT version FROM privacy_spaces WHERE namespace=?',(namespace,)).fetchone()
        pending=db.execute("SELECT 1 FROM privacy_operations WHERE namespace=? AND status!='complete' LIMIT 1",(namespace,)).fetchone()
        return dict(version=row[0] if row else 0,pending=bool(pending))

    def blocked_sources(self, namespace, db=None):
        if db is None:
            with self.db() as connection: return self.blocked_sources(namespace, connection)
        return {r[0] for r in db.execute('SELECT source_id FROM privacy_sources WHERE namespace=?',(namespace,))}

    def source_blocked(self, namespace, ids, db=None):
        return bool(set(ids) & self.blocked_sources(namespace, db))

    def memory_blocked(self, namespace, memory_id):
        with self.db() as db:
            return bool(db.execute('SELECT 1 FROM privacy_memories WHERE namespace=? AND memory_id=?',(namespace,memory_id)).fetchone())

    def preview(self, namespace, actor, plan):
        token=secrets.token_hex(12)
        with self.db(write=True) as db:
            db.execute('DELETE FROM privacy_confirmations WHERE expires<?',(time.time(),))
            db.execute('INSERT INTO privacy_confirmations VALUES(?,?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),namespace,actor,json.dumps(plan),time.time()+600))
        return token

    def _commit(self, db, namespace, mode, plan):
        version=self.state(namespace,db)['version']+1
        db.execute('INSERT INTO privacy_spaces VALUES(?,?) ON CONFLICT(namespace) DO UPDATE SET version=excluded.version',(namespace,version))
        operation=uuid.uuid4().hex
        now=time.time()
        db.execute('INSERT INTO privacy_operations VALUES(?,?,?,?,?,?,?,?,?)',(operation,namespace,version,mode,json.dumps(plan),'pending',None,now,now))
        for source in plan.get('source_ids',[]):
            db.execute('INSERT INTO privacy_sources VALUES(?,?,?,?) ON CONFLICT(namespace,source_id) DO UPDATE SET version=excluded.version,mode=CASE WHEN privacy_sources.mode=\'erase\' THEN \'erase\' ELSE excluded.mode END',(namespace,source,version,mode))
        for memory in plan.get('memory_ids',[]):
            db.execute('INSERT INTO privacy_memories VALUES(?,?,?) ON CONFLICT(namespace,memory_id) DO UPDATE SET version=excluded.version',(namespace,memory,version))
        return dict(id=operation,namespace=namespace,version=version,mode=mode,plan=plan,status='pending')

    def commit(self, namespace, mode, plan):
        if mode not in ('forget','erase'): raise ValueError('Invalid deletion mode')
        with self.db(write=True) as db: return self._commit(db,namespace,mode,plan)

    def confirm(self, namespace, actor, token):
        with self.db(write=True) as db:
            key=hashlib.sha256(token.encode()).hexdigest()
            row=db.execute('SELECT * FROM privacy_confirmations WHERE token_hash=?',(key,)).fetchone()
            if not row or row['expires']<time.time() or row['namespace']!=namespace or row['actor']!=actor:
                raise PrivacyBlocked('Confirmation is expired or belongs to another identity')
            plan=json.loads(row['plan'])
            if plan['base_version']!=self.state(namespace,db)['version']:
                raise PrivacyBlocked('Deletion preview is stale')
            db.execute('DELETE FROM privacy_confirmations WHERE token_hash=?',(key,))
            return self._commit(db,namespace,'erase',plan)

    @contextmanager
    def write_guard(self, namespace, expected_version, sources=()):
        # Hold the authority's cross-process writer lock through the SDK write.
        # A deletion waits for an admitted writer, then purges its derivatives.
        with self.db(write=True) as db:
            state=self.state(namespace,db)
            if state['pending'] or state['version']!=expected_version or self.source_blocked(namespace,sources,db):
                raise PrivacyBlocked('Privacy revision or source is no longer writable')
            yield

    def operations(self, namespace=None, pending=False):
        clauses,args=[],[]
        if namespace: clauses.append('namespace=?');args.append(namespace)
        if pending: clauses.append("status!='complete'")
        sql='SELECT * FROM privacy_operations'+(' WHERE '+' AND '.join(clauses) if clauses else '')+' ORDER BY created,id'
        with self.db() as db:
            rows=[dict(r) for r in db.execute(sql,args)]
        for row in rows: row['plan']=json.loads(row['plan'])
        return rows

    def update(self, operation, status, error=None):
        if status not in ('pending','complete','blocked'): raise ValueError('Invalid deletion status')
        with self.db(write=True) as db:
            db.execute('UPDATE privacy_operations SET status=?,error=?,updated=? WHERE id=?',(status,error,time.time(),operation['id']))

    def clear_transient_confirmations(self):
        with self.db(write=True) as db: db.execute('DELETE FROM privacy_confirmations')


def evidence_ids(payload):
    return [s['id'] for s in payload.get('evidence',{}).get('sources',[]) if isinstance(s,dict) and isinstance(s.get('id'),str)]
