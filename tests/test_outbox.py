import importlib.util
from pathlib import Path
import tempfile
import unittest

FILE = Path(__file__).parents[1] / 'memory_outbox.py'


class DurableWrites(unittest.TestCase):
    def load(self):
        self.assertTrue(FILE.exists(), 'durable memory outbox is missing')
        spec = importlib.util.spec_from_file_location('memory_outbox', FILE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.Outbox

    def test_pending_turn_survives_restart_and_repeated_delivery(self):
        factory = self.load()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'queue.sqlite3'
            queue = factory(path)
            queue.enqueue('qq-message-1', {'user_id': 'alice', 'messages': [{'role': 'user', 'content': 'prefer concise replies'}]})
            restored = factory(path)
            restored.enqueue('qq-message-1', {'user_id': 'alice', 'messages': []})
            job = restored.claim()
            self.assertEqual(job['payload']['messages'][0]['content'], 'prefer concise replies')
            restored.done(job['id'])
            self.assertIsNone(restored.claim())
            self.assertEqual(restored.stats().get('done'), 1)

    def test_forgetting_cancels_older_jobs_for_only_that_identity(self):
        factory = self.load()
        with tempfile.TemporaryDirectory() as tmp:
            queue = factory(Path(tmp) / 'queue.sqlite3')
            queue.enqueue('a', {'user_id': 'alice'})
            queue.enqueue('b', {'user_id': 'bob'})
            job = queue.claim()
            self.assertEqual(job['id'], 'a')
            queue.cancel_user('alice')
            self.assertFalse(queue.is_running('a'))
            self.assertEqual(queue.claim()['id'], 'b')


if __name__ == '__main__':
    unittest.main()
