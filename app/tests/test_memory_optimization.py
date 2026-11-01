import json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from hindsight_adapter import HindsightAdapter
import memory_metrics

class MemoryOptimization(unittest.TestCase):
    def test_recall_uses_current_native_include_contract_without_changing_budget(self):
        adapter=HindsightAdapter('synthetic-token')
        with patch.object(adapter,'request',return_value={'results':[]}) as request:
            self.assertEqual(adapter.recall('qq-'+'a'*64,'公开测试',6),([],None))
        body=request.call_args.args[2]
        self.assertEqual(body['include'],{'chunks':None,'entities':None})
        self.assertNotIn('include_entities',body);self.assertNotIn('include_chunks',body)
        self.assertEqual(body['budget'],'low');self.assertEqual(body['max_tokens'],2200)

    def test_retention_metrics_are_numeric_and_exclude_text_ids_and_credentials(self):
        with tempfile.TemporaryDirectory() as directory,patch.dict(os.environ,{'QQBOT_METRICS_DIR':directory}):
            memory_metrics.record('retain',elapsedMs=2.5,messageCount=3,sourceCount=2,
                status='ok',prompt='private-text',identity='private-id',token='private-token')
            text=(Path(directory)/'memory-runtime.jsonl').read_text(encoding='utf-8')
            self.assertNotIn('private',text)
            self.assertEqual(json.loads(text)['messageCount'],3)

    def test_one_local_window_is_one_native_content_with_stable_document_and_all_sources(self):
        adapter=HindsightAdapter('synthetic-token');namespace='qq-'+'a'*64
        data=[{'role':'user','content':'成员甲：我偏爱热茶'},{'role':'user','content':'成员甲：不要加糖'}]
        meta={'evidence':{'sources':[{'id':'one','role':'user'},{'id':'two','role':'user'}]}}
        with patch.object(adapter,'request',return_value={'success':True}) as request:
            first=adapter.retain(namespace,data,session_id='fixture',request_id='fixed-window',meta=meta)
            second=adapter.retain(namespace,data,session_id='fixture',request_id='fixed-window',meta=meta)
        self.assertEqual(first['document_id'],second['document_id'])
        body=request.call_args.args[2];self.assertFalse(body['async']);self.assertEqual(len(body['items']),1)
        item=body['items'][0];self.assertIn('不要加糖',item['content'])
        self.assertEqual(json.loads(item['metadata']['qq_meta']),meta)

if __name__=='__main__':unittest.main()
