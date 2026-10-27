import importlib.util
import json
import os
from pathlib import Path
import threading
import tempfile
import sys
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

os.environ['MEMORY_BRIDGE_TOKEN'] = 'test-only-token'
sys.path.insert(0, str(Path(__file__).parents[1]))
spec = importlib.util.spec_from_file_location('memory_bridge', Path(__file__).parents[1] / 'hymemory_service.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
USER = 'qq-' + 'a' * 64


class StartupWarmup(unittest.TestCase):
    def test_warmup_initializes_embedding_and_sdk_before_first_message(self):
        with patch.object(bridge, 'get_embedding') as embedding, patch.object(bridge, 'get_client') as sdk:
            bridge.warmup()
            embedding.assert_called_once()
            sdk.assert_called_once()


class LoopbackSdkNetwork(unittest.TestCase):
    def test_local_sdk_endpoints_use_an_explicit_direct_transport(self):
        previous = bridge._client
        bridge._client = None
        try:
            with patch.dict(os.environ, {'MEMORY_LLM_BASE_URL': 'http://127.0.0.1:8766/v1',
                                         'MEMORY_EMBEDDER_BASE_URL': 'http://127.0.0.1:8765/v1'}):
                with patch('hy_memory.HyMemoryClient') as factory:
                    bridge.get_client()
                    config = factory.call_args.kwargs.get('config')
                    self.assertIsNotNone(config, 'SDK must receive explicit loopback transport configuration')
                    self.assertTrue(callable(config.http_transport_factory))
        finally:
            bridge._client = previous

    def test_explicit_transport_bypasses_an_unreachable_proxy(self):
        import asyncio
        import httpx
        from memory_network import sdk_config
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        class Health(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'ok')
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Health)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        async def request(config):
            async with httpx.AsyncClient(transport=config.http_transport_factory()) as client:
                response = await client.get(f'http://127.0.0.1:{server.server_port}/health')
                self.assertEqual(response.status_code, 200)
        try:
            with patch.dict(os.environ, {'MEMORY_LLM_BASE_URL': 'http://127.0.0.1:8766/v1',
                                         'MEMORY_EMBEDDER_BASE_URL': 'http://127.0.0.1:8765/v1',
                                         'HTTP_PROXY': 'http://127.0.0.1:1', 'ALL_PROXY': 'http://127.0.0.1:1', 'NO_PROXY': ''}):
                asyncio.run(request(sdk_config()))
        finally:
            server.shutdown()
            server.server_close()

    def test_remote_endpoint_keeps_default_transport(self):
        from memory_network import sdk_config
        with patch.dict(os.environ, {'MEMORY_LLM_BASE_URL': 'https://example.invalid/v1',
                                     'MEMORY_EMBEDDER_BASE_URL': 'http://127.0.0.1:8765/v1'}):
            self.assertIsNone(sdk_config().http_transport_factory)


class SdkShape:
    def list_memories(self, **kwargs):
        return {'vdb': {'memories': [{'memory_id': 'test-memory', 'content': 'a preference', 'user_id': USER}], 'total': 1}}

    def get(self, memory_id):
        return {'memory_id': memory_id, 'user_id': USER, 'agent_id': 'qqbot-hymemory'}

    def delete(self, memory_id):
        return {'success': True, 'deleted_count': 1}

    def add(self, *args, **kwargs):
        return {'success': False, 'error': 'test SDK extraction failure'}

    def search(self, *args, **kwargs):
        return {'memories': {'normal': [{'memory_id': 'test-memory', 'content': 'a preference', 'score': 0.9}]}}


class BridgeContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        bridge.DATA = Path(cls.tmp.name)
        bridge._client = SdkShape()
        cls.server = bridge.ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def call(self, path, payload):
        request = urllib.request.Request(
            f'http://127.0.0.1:{self.server.server_port}{path}',
            data=json.dumps({'user_id': USER, **payload}).encode(),
            headers={'Authorization': 'Bearer test-only-token', 'Content-Type': 'application/json'},
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_delete_uses_real_sdk_memory_id_and_namespace(self):
        status, payload = self.call('/delete', {'id': 'test-memory'})
        self.assertEqual(status, 200)
        self.assertTrue(payload['ok'])

    def test_sdk_write_failure_is_not_reported_as_success(self):
        status, payload = self.call('/add', {'text': 'a preference'})
        self.assertEqual(status, 503)
        self.assertFalse(payload['ok'])

    def test_list_normalizes_actual_sdk_nested_memory_id(self):
        status, payload = self.call('/list', {})
        self.assertEqual(status, 200)
        self.assertIn('memories', payload)
        self.assertEqual(payload['memories'][0]['id'], 'test-memory')

    def test_search_exposes_provenance_and_score(self):
        status, payload = self.call('/search', {'query': 'preference'})
        self.assertEqual(status, 200)
        self.assertIn('memories', payload)
        self.assertEqual(payload['memories'][0]['score'], 0.9)

    def test_completed_turn_is_enqueued_without_calling_the_llm(self):
        status, payload = self.call('/enqueue', {'job_id': 'b' * 64, 'messages': [{'role': 'user', 'content': 'a preference'}]})
        self.assertEqual(status, 202)
        self.assertTrue(payload['ok'])


if __name__ == '__main__':
    unittest.main()
