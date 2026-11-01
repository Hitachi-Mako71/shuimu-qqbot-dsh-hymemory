from pathlib import Path
import json
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from privacy_ledger import PrivacyLedger
from memory_lifecycle import MemoryLifecycle
from restore_privacy import sanitize_restored_payload
from qq_identity import namespace

ALICE=dict(appId='timetable-lifecycle',scope='c2c',peerId='alice',senderId='alice')
BOB=dict(appId='timetable-lifecycle',scope='c2c',peerId='bob',senderId='bob')
class FakeAdapter:
    def delete(self,operation):pass
    def erase_auxiliary(self,operation):pass

class TimetableLifecycle(unittest.TestCase):
    def setUp(self):
        (ROOT/'.tmp').mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(prefix='timetable-lifecycle-',dir=ROOT/'.tmp')
        self.project=Path(self.temp.name)
        self.ledger=PrivacyLedger(self.project/'.privacy/lifecycle.sqlite3')
        self.life=MemoryLifecycle(self.project,self.ledger,dsh_home=self.project/'home')
        self.ns=namespace(ALICE);self.other=namespace(BOB)
        self.directory=self.project/'data/timetables';self.directory.mkdir()
        self.target=self.directory/(self.ns+'.json');self.target.write_text(json.dumps({'active':'synthetic','previous':'synthetic','pending':'synthetic'}))
        self.bob=self.directory/(self.other+'.json');self.bob.write_text('{"active":"other"}')

    def tearDown(self):
        self.assertTrue(self.project.resolve().is_relative_to((ROOT/'.tmp').resolve()))
        self.temp.cleanup()

    def operation(self,mode):
        return self.ledger.commit(self.ns,mode,dict(source_ids=[],memory_ids=[],message_ids=[],session_ids=[],legacy_unattributed=False))

    def test_physical_erasure_removes_current_previous_pending_and_temp_for_only_one_identity(self):
        temporary=self.directory/(self.ns+'.json.synthetic.tmp');temporary.write_text('synthetic partial write')
        self.life.apply(self.operation('erase'),FakeAdapter())
        self.assertFalse(self.target.exists());self.assertFalse(temporary.exists());self.assertTrue(self.bob.exists())

    def test_logical_memory_forgetting_preserves_authoritative_timetable(self):
        before=self.target.read_bytes();self.life.apply(self.operation('forget'),FakeAdapter())
        self.assertEqual(self.target.read_bytes(),before)

    def test_isolated_restore_applies_current_physical_deletion_to_timetable_snapshots(self):
        payload=self.project/'restore-payload'
        folder=payload/'data/timetables';folder.mkdir(parents=True)
        old=folder/(self.ns+'.json');old.write_text('historical synthetic timetable')
        other=folder/(self.other+'.json');other.write_text('other timetable')
        operation=self.operation('erase')
        sanitize_restored_payload(payload,self.ledger,adapter=FakeAdapter())
        self.assertFalse(old.exists());self.assertTrue(other.exists())
        self.assertEqual(self.ledger.state(self.ns)['version'],operation['version'])

    def test_unsafe_namespace_cannot_select_a_timetable_file(self):
        with self.assertRaises(Exception):self.life.erase_timetable('../other')
        self.assertTrue(self.target.exists());self.assertTrue(self.bob.exists())

if __name__=='__main__':unittest.main()
