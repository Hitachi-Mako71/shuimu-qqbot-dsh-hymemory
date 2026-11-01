import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from evidence_queue import EvidenceQueue
from privacy_ledger import PrivacyLedger
import memory_gateway


class RetentionContext(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.namespace='qq-'+'a'*64
        self.ledger=PrivacyLedger(self.root/'privacy.sqlite3')
        self.queue=EvidenceQueue(self.root/'evidence.sqlite3',self.ledger)

    def tearDown(self):
        self.tmp.cleanup()

    def event(self,key,role='user',text='短句',related=(),raw=None):
        with self.queue.connection(transaction=True) as db:
            db.execute('''INSERT INTO evidence_events
                (id,namespace,app_id,scope,peer_id,actor_id,role,kind,state,text,raw_json,recorded_at,related_ids_json,session_id,eligible)
                VALUES (?,?,?,'group','group-a','person-a',?,?,?,?,?,'2026-10-28T00:00:00Z',?,'session-a',1)''',
                (key,self.namespace,'fixture-app',role,'inbound' if role=='user' else 'markdown',
                 'received' if role=='user' else 'accepted',text,json.dumps(raw or {}),json.dumps(related)))

    def enqueue(self,key):
        with self.queue.connection(transaction=True) as db:
            length=db.execute('SELECT length(text) FROM evidence_events WHERE id=?',(key,)).fetchone()[0]
            db.execute("INSERT INTO evidence_jobs(id,namespace,source_event_id,start_offset,end_offset,status,due,created_at,updated_at) VALUES (?,?,?,0,?,'pending',0,'2026-10-28T00:00:00Z','2026-10-28T00:00:00Z')",('job-'+key,self.namespace,key,length))

    def test_legacy_short_sources_reserve_system_and_current_message_slots(self):
        ids=['user-'+str(i) for i in range(160)]
        for key in ids:self.event(key)
        self.event('reply',role='assistant',text='助手的实际回复',related=ids)
        self.enqueue('reply')
        job=self.queue.claim()
        self.assertIsNotNone(job)
        self.assertLessEqual(len(job['payload']['messages'])+1,128)
        self.assertEqual(job['payload']['messages'][-1],{'role':'assistant','content':'助手的实际回复'})
        self.assertEqual(job['payload']['evidence']['sources'][-1]['id'],'reply')
        with self.queue.connection() as db:
            self.assertEqual(len(json.loads(db.execute("SELECT related_ids_json FROM evidence_events WHERE id='reply'").fetchone()[0])),160)

    def test_new_assistant_extracts_direct_turn_only_and_keeps_deletion_dependencies(self):
        self.event('old',text='以前讨论的无关内容')
        self.event('current',text='本轮明确提出的偏好')
        self.event('reply',role='assistant',text='已确认理解本轮内容',related=['old','current'],
            raw={'_qqAgentEvidence':{'schema':1,'directSourceIds':['current']}})
        self.enqueue('reply')
        payload=self.queue.claim()['payload']
        self.assertEqual([s['id'] for s in payload['evidence']['sources']],['current','reply'])
        self.assertNotIn('以前讨论的无关内容',str(payload['messages']))
        with self.queue.connection() as db:
            self.assertEqual(json.loads(db.execute("SELECT related_ids_json FROM evidence_events WHERE id='reply'").fetchone()[0]),['old','current'])

    def test_direct_source_marker_cannot_select_a_source_outside_dependencies(self):
        self.event('current')
        self.event('reply',role='assistant',related=['current'],
            raw={'_qqAgentEvidence':{'schema':1,'directSourceIds':['foreign']}})
        self.enqueue('reply')
        self.assertIsNone(self.queue.claim())
        self.assertEqual(self.queue.stats().get('blocked'),1)

    def test_deleted_indirect_dependency_still_blocks_new_direct_context(self):
        self.event('old');self.event('current')
        self.event('reply',role='assistant',related=['old','current'],
            raw={'_qqAgentEvidence':{'schema':1,'directSourceIds':['current']}})
        self.enqueue('reply')
        with self.ledger.db(write=True) as db:
            db.execute('INSERT INTO privacy_sources(namespace,source_id,version,mode) VALUES (?,?,1,\'logical\')',(self.namespace,'old'))
        self.assertIsNone(self.queue.claim())
        self.assertEqual(self.queue.stats().get('blocked'),1)

    def test_gateway_reports_deterministic_payload_failure_with_typed_error(self):
        from hindsight_adapter import HindsightAdapter
        gateway=memory_gateway.MemoryGateway(HindsightAdapter('synthetic-token'),self.ledger)
        with self.assertRaises(ValueError) as caught:
            gateway.retain(self.namespace,[{'role':'user','content':'x'}]*129,
                session_id='fixture',request_id='fixture',meta={},expected_version=0,source_ids=[])
        self.assertEqual(type(caught.exception).__name__,'InvalidRetentionPayload')

    def worker_failure(self,error):
        spec=importlib.util.spec_from_file_location('retention_worker_test',ROOT/'hymemory_service.py')
        service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
        self.event('current');self.enqueue('current')
        stop=threading.Event()
        def fail(_body):
            stop.set()
            raise error
        with patch.object(service,'_stop',stop),patch.object(service,'get_evidence_queue',return_value=self.queue), \
             patch.object(service,'validate_request',return_value=self.namespace),patch.object(service,'write_memory',side_effect=fail):
            service.evidence_worker()
        with self.queue.connection() as db:
            return dict(db.execute("SELECT status,error,attempts FROM evidence_jobs WHERE id='job-current'").fetchone())

    def test_deterministic_worker_failure_is_blocked_instead_of_retried(self):
        error=getattr(memory_gateway,'InvalidRetentionPayload',ValueError)('synthetic invalid payload')
        row=self.worker_failure(error)
        self.assertEqual(row['status'],'blocked')
        self.assertEqual(row['error'],'InvalidPayload')
        self.assertEqual(row['attempts'],1)

    def test_transient_worker_failure_remains_retryable(self):
        row=self.worker_failure(OSError('synthetic temporary failure'))
        self.assertEqual(row['status'],'pending')
        self.assertEqual(row['error'],'OSError')

    def window(self,keys=('one','two'),closes=1,window_id='11111111-1111-4111-8111-111111111111'):
        raw={'_qqAgentEvidence':{'schema':1,'retainWindow':{'id':window_id,'closesAt':closes,'maxItems':4}}}
        for key in keys:self.event(key,raw=raw);self.enqueue(key)

    def test_closed_window_claims_once_and_completes_each_original_job(self):
        self.window()
        job=self.queue.claim(now=10)
        self.assertEqual(len(job.get('members',[])),2)
        self.assertEqual([s['id'] for s in job['payload']['evidence']['sources']],['one','two'])
        self.assertEqual(len(job['payload']['messages']),2)
        self.assertTrue(self.queue.is_running(job));self.assertTrue(self.queue.renew(job))
        self.queue.done(job)
        self.assertEqual(self.queue.stats().get('done'),2)
        self.assertIsNone(self.queue.claim(now=10))

    def test_window_waits_until_closed_before_claiming_members(self):
        self.window(closes=100)
        self.assertIsNone(self.queue.claim(now=50))
        self.assertEqual(len(self.queue.claim(now=103).get('members',[])),2)

    def test_window_identity_and_actor_boundaries_are_never_merged(self):
        self.window()
        with self.queue.connection(transaction=True) as db:
            db.execute("UPDATE evidence_events SET actor_id='other-person' WHERE id='two'")
        first=self.queue.claim(now=10);second=self.queue.claim(now=10)
        self.assertEqual(len(first['payload']['messages']),1)
        self.assertEqual(len(second['payload']['messages']),1)
        self.assertNotEqual(first['payload']['identity']['senderId'],second['payload']['identity']['senderId'])

    def test_window_request_identity_survives_lease_expiry_and_partial_completion(self):
        self.window()
        first=self.queue.claim(now=10)
        self.assertEqual(len(first.get('members',[])),2)
        with self.queue.connection(transaction=True) as db:
            db.execute("UPDATE evidence_jobs SET status='done',lease_token=NULL WHERE source_event_id='one'")
            db.execute("UPDATE evidence_jobs SET lease_until=0 WHERE status='running'")
        second=self.queue.claim(now=1000)
        self.assertEqual(second['payload']['job_id'],first['payload']['job_id'])
        self.assertEqual(second['payload']['messages'],first['payload']['messages'])

    def test_canceling_one_window_member_does_not_complete_or_drop_the_other(self):
        self.window()
        job=self.queue.claim(now=10)
        self.assertEqual(len(job.get('members',[])),2)
        self.queue.cancel_sources(self.namespace,['one'])
        self.assertFalse(self.queue.is_running(job))
        with self.queue.connection() as db:
            states={r['source_event_id']:r['status'] for r in db.execute('SELECT * FROM evidence_jobs')}
        self.assertEqual(states['one'],'canceled');self.assertEqual(states['two'],'pending')

    def test_expired_member_waits_for_another_valid_member_lease(self):
        self.window()
        first=self.queue.claim(now=10)
        with self.queue.connection(transaction=True) as db:
            db.execute("UPDATE evidence_jobs SET lease_until=1 WHERE source_event_id='one'")
        # Bound claim iterations so a regression fails instead of hanging CI.
        original=self.queue._window
        attempts=[]
        def bounded(*args):
            attempts.append(1)
            self.assertLess(len(attempts),4,'expired member was selected repeatedly')
            return original(*args)
        with patch.object(self.queue,'_window',side_effect=bounded):
            self.assertIsNone(self.queue.claim(now=20))
        with self.queue.connection() as db:
            row=db.execute("SELECT status,due,lease_token FROM evidence_jobs WHERE source_event_id='one'").fetchone()
        self.assertEqual(row['status'],'pending');self.assertEqual(row['due'],610);self.assertIsNone(row['lease_token'])
        self.assertFalse(self.queue.done(first))


if __name__=='__main__':unittest.main()
