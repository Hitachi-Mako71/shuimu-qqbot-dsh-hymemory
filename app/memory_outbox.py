"""Durable, idempotent QQ turn delivery to Hy Memory (SQLite WAL)."""
import json
from contextlib import contextmanager
from pathlib import Path
import sqlite3
import time


class Outbox:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._db() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, due REAL NOT NULL, created REAL NOT NULL, error TEXT)')
            db.execute("UPDATE jobs SET status='pending' WHERE status='running'")

    @contextmanager
    def _db(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def enqueue(self, job_id, payload):
        now = time.time()
        with self._db() as db:
            db.execute('INSERT OR IGNORE INTO jobs(id,user_id,payload,status,due,created) VALUES(?,?,?,?,?,?)', (job_id, payload['user_id'], json.dumps(payload, ensure_ascii=False), 'pending', now, now))
        return job_id

    def claim(self):
        with self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT * FROM jobs WHERE status='pending' AND due<=? ORDER BY created,id LIMIT 1", (time.time(),)).fetchone()
            if not row:
                return None
            db.execute("UPDATE jobs SET status='running',attempts=attempts+1 WHERE id=?", (row['id'],))
            return {'id': row['id'], 'payload': json.loads(row['payload']), 'attempts': row['attempts'] + 1}

    def is_running(self, job_id):
        with self._db() as db:
            row = db.execute('SELECT status FROM jobs WHERE id=?', (job_id,)).fetchone()
            return bool(row and row['status'] == 'running')

    def done(self, job_id):
        with self._db() as db:
            db.execute("UPDATE jobs SET status='done',payload='{}',error=NULL WHERE id=? AND status='running'", (job_id,))

    def retry(self, job_id, error_class, attempts):
        with self._db() as db:
            db.execute("UPDATE jobs SET status='pending',error=?,due=? WHERE id=? AND status='running'", (error_class, time.time() + min(300, 5 * 2 ** min(attempts, 6)), job_id))

    def hold(self, job_id):
        # Preserve the evidence for review; unauthorized old jobs never write back.
        with self._db() as db:
            db.execute("UPDATE jobs SET status='blocked',error='IdentityPermissionRejected' WHERE id=? AND status='running'", (job_id,))

    def cancel_user(self, user_id):
        with self._db() as db:
            db.execute("UPDATE jobs SET status='canceled',payload='{}' WHERE user_id=? AND status IN ('pending','running')", (user_id,))

    def stats(self):
        with self._db() as db:
            out = {row['status']: row['n'] for row in db.execute('SELECT status,count(*) AS n FROM jobs GROUP BY status')}
            row = db.execute("SELECT error FROM jobs WHERE error IS NOT NULL AND status='pending' ORDER BY created DESC LIMIT 1").fetchone()
            if row:
                out['last_error_class'] = row['error']
            return out
