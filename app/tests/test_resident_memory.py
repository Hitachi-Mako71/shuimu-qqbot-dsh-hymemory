"""Resident startup regression: no first user request is needed to load memory."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('resident_memory_test_service', ROOT / 'hymemory_service.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class ResidentStartup(unittest.TestCase):
    def tearDown(self):
        bridge._stop.clear()

    def test_startup_loads_vector_model_and_hindsight_without_a_user_request(self):
        model = object()
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            (data / 'memory-engine.json').write_text(json.dumps({
                'primary': 'hindsight', 'version': '1.1.0', 'migration_complete': True}), encoding='utf-8')
            with patch.object(bridge, 'DATA', data), patch.object(bridge, 'TOKEN', 'isolated-test-token'), \
                 patch.object(bridge, '_client', None), patch.object(bridge, '_embedding', None), \
                 patch.dict(sys.modules, {'fastembed': SimpleNamespace(TextEmbedding=lambda *a, **kw: model)}), \
                 patch.object(bridge.subprocess, 'run') as launch, \
                 patch.object(bridge.HindsightAdapter, '_request', return_value={'status': 'healthy'}) as health:
                self.assertTrue(callable(getattr(bridge, 'warmup', None)), 'startup preloading is absent')
                bridge.warmup()
                self.assertIs(bridge._embedding, model)
                self.assertIsInstance(bridge._client, bridge.HindsightAdapter)
                launch.assert_called_once()
                self.assertEqual(Path(launch.call_args.args[0][-1]).name, 'start-hindsight.ps1')
                health.assert_called_once_with('GET', '/health', None)

    def test_service_initializes_resources_before_accepting_first_request(self):
        model = object()
        client = SimpleNamespace(close=lambda: None)

        class Thread:
            def __init__(self, target, daemon):
                self.target = target
            def start(self):
                if self.target.__name__ == 'startup_warmup_worker':
                    self.target()

        class Server:
            def __init__(self, *args):
                pass
            def serve_forever(server):
                self.assertIs(bridge._embedding, model, 'service accepted requests before preloading')
                self.assertIs(bridge._client, client)
                raise KeyboardInterrupt
            def server_close(self):
                pass

        def load_model():
            bridge._embedding = model
            return model

        def load_client():
            bridge._client = client
            return client

        with tempfile.TemporaryDirectory() as directory, \
             patch.object(bridge, 'DATA', Path(directory)), patch.object(bridge, 'TOKEN', 'isolated-test-token'), \
             patch.object(bridge, '_embedding', None), patch.object(bridge, '_client', None), \
             patch.object(bridge, 'ThreadingHTTPServer', Server), patch.object(bridge.threading, 'Thread', Thread), \
             patch.object(bridge, 'get_embedding', side_effect=load_model), \
             patch.object(bridge, 'get_client', side_effect=load_client), \
             patch.object(bridge, 'get_outbox'), patch.object(bridge, 'get_evidence_queue'), \
             patch.object(bridge, 'kick_privacy_worker'):
            bridge.main()


if __name__ == '__main__':
    unittest.main()
