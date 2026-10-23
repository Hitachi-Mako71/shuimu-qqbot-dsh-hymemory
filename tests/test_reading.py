"""Isolated reader invariants; no account, network, real book or QQ messages."""
from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from reading_library import ReadingLibrary

OWNER='qq-'+'a'*64
OTHER='qq-'+'b'*64
VERDICT={k:True for k in ['supported','within_progress','links_supported','reflection_separate','no_fabricated_activity']}


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.allowed=Path(__file__).resolve().parents[2]/'work/reading-unit'
        self.allowed.mkdir(parents=True,exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=self.allowed)
        self.root=Path(self.tmp.name)
        assert self.root.resolve().is_relative_to(self.allowed.resolve())
        self.file=self.root/'fixture.txt'
        self.file.write_text('园丁每天观察新叶。雨后的小路很安静。疑问留给下一页。'*250,encoding='utf-8')
        self.store=ReadingLibrary(self.root/'reader')
        self.store.import_book(OWNER,self.file,'合成阅读材料','测试作者')

    def tearDown(self):
        assert self.root.resolve().is_relative_to(self.allowed.resolve())
        self.tmp.cleanup()

    def draft(self, **updates):
        value={'summary':'这一段写园丁观察新叶。','reflection':'反复的观察让我想到，理解需要耐心，也要保留疑问。',
               'evidence':[{'page':1,'quote':'园丁每天观察新叶。'}], 'links':[], 'questions':['后文如何变化？'],
               'overview':'目前只读到园丁观察新叶，不推断后文。'}
        return {**value,**updates}

    def finish_one(self):
        self.store.enqueue(OWNER)
        with patch('reading_library.json_model',side_effect=[self.draft(),VERDICT]):
            self.assertTrue(self.store.process_one())

    def test_import_is_not_reading_and_never_sends_whole_book(self):
        status=self.store.status(OWNER)['books'][0]
        self.assertEqual(status['cursor'],0)
        self.assertGreater(status['total'],1)
        self.store.enqueue(OWNER);job=self.store.claim();context=self.store.context_for_job(job)
        self.assertLessEqual(len(context['excerpt']['text']),2400)
        self.assertNotIn('filename',context['book'])
        self.assertEqual(context['previousNotes'],[])

    def test_scopes_are_isolated(self):
        self.assertEqual(self.store.status(OTHER)['books'],[])
        self.finish_one()
        self.assertEqual(self.store.recall(OTHER)['notes'],[])

    def test_model_input_has_explicit_page_fragments_not_offset_counting(self):
        self.store.enqueue(OWNER);context=self.store.context_for_job(self.store.claim())
        supplied=self.store.model_input(context)
        self.assertNotIn('text',supplied['excerpt'])
        self.assertEqual(supplied['excerpt']['pages'][0]['page'],1)
        self.assertEqual(''.join(p['text'] for p in supplied['excerpt']['pages']),context['excerpt']['text'])

    def test_anchor_selects_verbatim_program_owned_source(self):
        self.store.enqueue(OWNER);context=self.store.context_for_job(self.store.claim())
        anchor=self.store.model_input(context)['excerpt']['pages'][0]['anchors'][0]
        note=self.store.validate_note(context,self.draft(evidence=[{'anchor':anchor['id']}]))
        self.assertEqual(note['evidence'][0]['quote'],anchor['text'])
        self.assertEqual(note['evidence'][0]['page'],1)

    def test_unknown_source_anchor_is_rejected(self):
        self.store.enqueue(OWNER);context=self.store.context_for_job(self.store.claim())
        with self.assertRaisesRegex(ValueError,'UnknownSourceAnchor'):
            self.store.validate_note(context,self.draft(evidence=[{'anchor':'A-not-provided'}]))

    def test_import_is_idempotent_and_keeps_cursor(self):
        self.finish_one()
        self.store.import_book(OWNER,self.file,'另一个显示名')
        status=self.store.status(OWNER)['books']
        self.assertEqual(len(status),1)
        self.assertEqual(status[0]['cursor'],1)

    def test_bogus_quote_cannot_advance_or_create_note(self):
        self.store.enqueue(OWNER)
        with patch('reading_library.json_model',return_value=self.draft(evidence=[{'page':1,'quote':'根本不存在的句子'}])):
            self.store.process_one()
        self.assertEqual(self.store.status(OWNER)['books'][0]['cursor'],0)
        self.assertEqual(self.store.recall(OWNER)['notes'],[])
        self.assertTrue(list((self.store.root/'quarantine').rglob('*.private.json')))

    def test_wrong_page_is_not_a_valid_source(self):
        self.store.enqueue(OWNER);context=self.store.context_for_job(self.store.claim())
        with self.assertRaisesRegex(ValueError,'QuoteNotIn'):
            self.store.validate_note(context,self.draft(evidence=[{'page':2,'quote':'园丁每天观察新叶。'}]))

    def test_independent_rejection_keeps_cursor(self):
        self.store.enqueue(OWNER)
        with patch('reading_library.json_model',side_effect=[self.draft(),{**VERDICT,'within_progress':False}]):
            self.store.process_one()
        self.assertEqual(self.store.status(OWNER)['books'][0]['cursor'],0)

    def test_overlong_draft_gets_one_bounded_repair_before_commit(self):
        self.store.enqueue(OWNER)
        with patch('reading_library.json_model',side_effect=[self.draft(summary='长'*901),self.draft(),VERDICT]) as generate:
            self.store.process_one()
        self.assertEqual(self.store.status(OWNER)['books'][0]['cursor'],1)
        self.assertEqual(generate.call_count,3)
        self.assertIn('formatRepair',generate.call_args_list[1].args[1])

    def test_note_cursor_and_outbox_survive_restart(self):
        self.finish_one();fresh=ReadingLibrary(self.store.root)
        self.assertEqual(fresh.status(OWNER)['books'][0]['cursor'],1)
        self.assertEqual(len(fresh.recall(OWNER)['notes']),1)
        self.assertEqual(fresh.recall(OWNER)['notes'][0]['indexStatus'],'pending')
        self.assertFalse(fresh.process_one())

    def test_next_chunk_has_persisted_overview_and_old_note(self):
        self.finish_one();self.store.enqueue(OWNER)
        context=self.store.context_for_job(self.store.claim())
        self.assertEqual(context['excerpt']['seq'],1)
        self.assertIn('园丁',context['book']['overview'])
        self.assertEqual(len(context['previousNotes']),1)
        self.assertEqual(context['previousNotes'][0]['seq'],0)

    def test_unknown_previous_note_link_is_rejected(self):
        self.finish_one();self.store.enqueue(OWNER)
        context=self.store.context_for_job(self.store.claim())
        with self.assertRaisesRegex(ValueError,'Unanchored'):
            self.store.validate_note(context,self.draft(links=[{'note':'not-real','relation':'呼应','evidence':0}]))

    def test_read_request_is_idempotent(self):
        for _ in range(5):self.store.enqueue(OWNER)
        with self.store.db() as db:self.assertEqual(db.execute('SELECT count(*) FROM jobs').fetchone()[0],1)

    def test_receipt_required_and_no_duplicate_share_after_ambiguity(self):
        self.finish_one();note=self.store.share(OWNER)['note']
        self.store.share(OWNER,note['token'],note['id'],False)
        self.assertIsNone(self.store.share(OWNER)['note'])
        with self.store.db() as db:self.assertEqual(db.execute('SELECT share_state FROM notes').fetchone()[0],'uncertain')

    def test_hy_failure_does_not_lose_note_or_cursor(self):
        self.finish_one()
        class Offline:
            def add_extracted(self,*args,**kwargs):raise ConnectionError()
        self.store.index_one(Offline())
        self.assertEqual(self.store.status(OWNER)['books'][0]['cursor'],1)
        self.assertEqual(self.store.recall(OWNER)['notes'][0]['indexStatus'],'pending')


if __name__=='__main__':unittest.main()
