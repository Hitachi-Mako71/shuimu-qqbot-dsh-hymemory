"""Durable index of fictional memories through the pinned public Hy Memory API.

Canonical facts remain in the companion ledger. SDK search hits are resolved
back to caller record IDs; rewritten SDK prose never replaces that ledger.
"""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time

AGENT = 'qqbot-companion-fiction'
SOURCE = 'qqbot-fiction'


def fiction_user(owner, epoch):
    return 'qq-' + hashlib.sha256(('fiction-v1|' + owner + '|' + epoch).encode()).hexdigest()


class FictionMemory:
    def __init__(self, directory):
        self.path = Path(directory) / 'fiction-index.sqlite3'
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS records(owner TEXT,epoch TEXT,id TEXT,content TEXT,meta TEXT,status TEXT,due REAL,attempts INTEGER DEFAULT 0,error TEXT,PRIMARY KEY(owner,epoch,id))')
            db.execute('CREATE TABLE IF NOT EXISTS bindings(owner TEXT,epoch TEXT,id TEXT,node_id TEXT,PRIMARY KEY(owner,epoch,id,node_id))')
            db.execute('CREATE TABLE IF NOT EXISTS clears(owner TEXT,epoch TEXT,status TEXT,due REAL,attempts INTEGER DEFAULT 0,error TEXT,PRIMARY KEY(owner,epoch))')
            db.execute('CREATE TABLE IF NOT EXISTS backend(version INTEGER)')
            db.execute('CREATE TABLE IF NOT EXISTS legacy_cleanup(owner TEXT,epoch TEXT,PRIMARY KEY(owner,epoch))')
            if not db.execute('SELECT 1 FROM backend WHERE version=2').fetchone():
                db.execute('INSERT OR IGNORE INTO legacy_cleanup SELECT DISTINCT owner,epoch FROM records')
                db.execute("UPDATE records SET status='pending',due=0,error=NULL WHERE status!='canceled'")
                db.execute('DELETE FROM bindings')
                db.execute('INSERT INTO backend VALUES(2)')
            db.execute("UPDATE records SET status='pending' WHERE status='running'")
            db.execute("UPDATE clears SET status='pending' WHERE status='running'")

    def cleanup_legacy(self, client):
        with self.db() as db:
            row = db.execute('SELECT owner,epoch FROM legacy_cleanup LIMIT 1').fetchone()
        if row is None:
            return False
        result = client.delete_all(user_id=fiction_user(row['owner'], row['epoch']), agent_ids=[AGENT])
        if result.get('success') is not True:
            raise RuntimeError('FictionLegacyCleanupUnconfirmed')
        with self.db() as db:
            db.execute('DELETE FROM legacy_cleanup WHERE owner=? AND epoch=?', tuple(row))
        return True

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def validate(owner, epoch):
        if not re.fullmatch(r'qq-[a-f0-9]{64}', owner) or not re.fullmatch(r'[a-f0-9-]{36}', epoch):
            raise ValueError('valid owner and fiction epoch required')

    def enqueue(self, owner, epoch, records):
        self.validate(owner, epoch)
        if not isinstance(records, list) or len(records) > 50:
            raise ValueError('at most 50 fictional records per batch')
        now = time.time()
        with self.db() as db:
            if db.execute('SELECT 1 FROM clears WHERE owner=? AND epoch=?', (owner, epoch)).fetchone():
                raise ValueError('fiction epoch has been cleared')
            for row in records:
                identifier = str(row.get('id', ''))
                content = str(row.get('content', ''))
                if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,120}', identifier) or not 1 <= len(content) <= 8000:
                    raise ValueError('invalid fictional record')
                metadata = row.get('meta', {})
                if not isinstance(metadata, dict) or metadata.get('fiction') is not True:
                    raise ValueError('fiction record metadata required')
                existing = db.execute('SELECT content FROM records WHERE owner=? AND epoch=? AND id=?', (owner, epoch, identifier)).fetchone()
                if existing and existing['content'] != content:
                    raise ValueError('fiction record IDs are immutable; use a new revision ID')
                db.execute('INSERT OR IGNORE INTO records(owner,epoch,id,content,meta,status,due) VALUES(?,?,?,?,?,?,?)',
                           (owner, epoch, identifier, content, json.dumps(metadata, ensure_ascii=False), 'pending', now))
        return len(records)

    def clear(self, owner, epoch):
        self.validate(owner, epoch)
        with self.db() as db:
            db.execute("UPDATE records SET status='canceled',content='',meta='{}' WHERE owner=? AND epoch=?", (owner, epoch))
            db.execute('DELETE FROM bindings WHERE owner=? AND epoch=?', (owner, epoch))
            db.execute("INSERT OR IGNORE INTO clears(owner,epoch,status,due) VALUES(?,?,'pending',?)", (owner, epoch, time.time()))

    def status(self, owner, epoch):
        self.validate(owner, epoch)
        with self.db() as db:
            counts = {r['status']: r['n'] for r in db.execute('SELECT status,count(*) n FROM records WHERE owner=? AND epoch=? GROUP BY status', (owner, epoch))}
            clearing = db.execute('SELECT status FROM clears WHERE owner=? AND epoch=?', (owner, epoch)).fetchone()
        return {'records': counts, 'clear': clearing['status'] if clearing else None}

    def claim(self):
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            clear = db.execute("SELECT * FROM clears WHERE status='pending' AND due<=? ORDER BY due LIMIT 1", (time.time(),)).fetchone()
            if clear:
                db.execute("UPDATE clears SET status='running',attempts=attempts+1 WHERE owner=? AND epoch=?", (clear['owner'], clear['epoch']))
                return 'clears', dict(clear)
            row = db.execute("SELECT * FROM records WHERE status='pending' AND due<=? ORDER BY due,id LIMIT 1", (time.time(),)).fetchone()
            if row:
                db.execute("UPDATE records SET status='running',attempts=attempts+1 WHERE owner=? AND epoch=? AND id=?", (row['owner'], row['epoch'], row['id']))
                return 'records', dict(row)
        return None

    def process_one(self, client):
        job = self.claim()
        if not job:
            return False
        table, row = job
        keys = (row['owner'], row['epoch'])
        where = 'owner=? AND epoch=?'
        if table == 'records':
            keys += (row['id'],)
            where += ' AND id=?'
        try:
            uid = fiction_user(row['owner'], row['epoch'])
            if table == 'clears':
                result = client.delete_all(user_id=uid, agent_ids=[AGENT])
                if result.get('success') is not True:
                    raise RuntimeError('FictionClearUnconfirmed')
                nodes = []
            else:
                metadata = json.loads(row['meta'])
                result = client.add_extracted(row['content'], user_id=uid, agent_id=AGENT,
                    session_id='fiction-ledger', source=SOURCE,
                    metadata={**metadata, 'companion_record_id': row['id'], 'fiction': True},
                    request_id=hashlib.sha256(('|'.join(keys)).encode()).hexdigest())
                if result.get('success') is not True:
                    raise RuntimeError('FictionWriteUnconfirmed')
                nodes = list(dict.fromkeys([*(result.get('memory_ids') or []), *([result.get('memory_id')] if result.get('memory_id') else [])]))
                verified = []
                for node in nodes:
                    memory = client.get(node)
                    if memory and memory.get('user_id') == uid and memory.get('agent_id') == AGENT and memory.get('content'):
                        verified.append(node)
                nodes = verified
                if not nodes:
                    raise RuntimeError('FictionReadbackUnconfirmed')
            with self.db() as db:
                current = db.execute(f'SELECT status FROM {table} WHERE {where}', keys).fetchone()
                if current and current['status'] == 'running':
                    if table == 'records':
                        for node in nodes:
                            db.execute('INSERT OR IGNORE INTO bindings(owner,epoch,id,node_id) VALUES(?,?,?,?)', (*keys, node))
                    db.execute(f"UPDATE {table} SET status='done',error=NULL WHERE {where}", keys)
        except Exception as error:
            code = str(error) if str(error).startswith('Fiction') and len(str(error)) <= 100 else type(error).__name__
            with self.db() as db:
                db.execute(f"UPDATE {table} SET status='pending',error=?,due=? WHERE {where} AND status='running'",
                           (code, time.time() + min(900, 10 * 2 ** min(row['attempts'], 6)), *keys))
        return True

    def search(self, client, normalize, owner, epoch, query, limit=8):
        self.validate(owner, epoch)
        with self.db() as db:
            if db.execute('SELECT 1 FROM clears WHERE owner=? AND epoch=?', (owner, epoch)).fetchone():
                return []
        uid = fiction_user(owner, epoch)
        result = client.search(query, scene='chat', user_ids=[uid], agent_ids=[AGENT], include_sources=[SOURCE], limit=min(max(limit, 1), 20))
        hits = []
        seen = set()
        with self.db() as db:
            for memory in normalize(result):
                rows = db.execute("SELECT r.id,r.content,r.meta FROM bindings b JOIN records r ON r.owner=b.owner AND r.epoch=b.epoch AND r.id=b.id WHERE b.owner=? AND b.epoch=? AND b.node_id=? AND r.status='done'", (owner, epoch, memory['id'])).fetchall()
                for row in rows:
                    if row['id'] not in seen:
                        seen.add(row['id'])
                        hits.append({'record_id': row['id'], 'content': row['content'], 'meta': json.loads(row['meta']), 'memory_id': memory['id'], 'score': memory.get('score')})
        return hits[:limit]
