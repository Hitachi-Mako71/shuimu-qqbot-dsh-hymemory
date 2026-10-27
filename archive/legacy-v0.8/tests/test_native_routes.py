import hashlib
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import yaml

sys.path.insert(0,str(Path(__file__).parents[1]))
import control_models
from personality_config import PromptLoader

class SharedRoutes(unittest.TestCase):
    @unittest.skipUnless(sys.platform=='win32','Windows controller worker')
    def test_status_worker_reports_persistent_runtime_error(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=root/'data/codex-work';folder.mkdir(parents=True)
            (root/'data/model-routing.json').write_text(json.dumps({'provider':'codex'}))
            (folder/'runtime.json').write_text(json.dumps({'phase':'error','lastFailure':{'code':'CODEX_THREAD_BUSY','method':'thread/resume'}}))
            result=root/'.run/control-console/jobs/status.json'
            worker=Path(__file__).parents[1]/'control-worker.ps1'
            reply=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(worker),'-Action','Status','-ProjectDir',str(root),'-ResultPath',str(result)],capture_output=True,timeout=20)
            self.assertEqual(reply.returncode,0,reply.stderr.decode(errors='replace'))
            state=json.loads(result.read_text(encoding='utf-8-sig'))['data']
            self.assertEqual(state['modelProvider'],'codex')
            self.assertEqual(state['nativeRuntime']['phase'],'error')

    def test_runtime_failure_is_visible_despite_successful_model_probe(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=root/'data/codex-work';folder.mkdir(parents=True)
            for name,value in {'status.json':{'connected':True,'updatedAt':1000},'probe.json':{'success':True,'model':'gpt-5.6-luna','updatedAt':1100},'runtime.json':{'phase':'error','lastFailure':{'at':1200,'code':'CODEX_THREAD_BUSY','method':'thread/resume','rpcCode':-32600}}}.items():
                (folder/name).write_text(json.dumps(value))
            with patch.object(control_models,'chat_ui_snapshot',return_value={}):
                native=control_models.snapshot(root,{})['native']
            self.assertTrue(native['connected'])
            self.assertEqual(native['runtime']['phase'],'error')
            self.assertEqual(native['runtime']['lastFailure']['method'],'thread/resume')
            self.assertEqual(native['probeAt'],1100)

    def test_switch_roundtrip_keeps_persona_memory_and_unknown_settings(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);profile=root/'profile';profile.mkdir()
            folder=root/'data/codex-work';folder.mkdir(parents=True)
            for file,value in {'models.json':{'models':[{'id':'gpt-6-luna','name':'Luna'}]},'status.json':{'connected':True},'probe.json':{'success':True,'model':'gpt-6-luna'}}.items():
                (folder/file).write_text(json.dumps(value))
            memory=root/'data/hy-memory';memory.mkdir();(memory/'keep.txt').write_text('same private memory')
            rows=[{'id':'im-qqbot','config':{'provider':'deepseek-account','model':'deepseek-flash','directPrompt':'柚柚 live persona','cwd':'shared-memory','custom':42,'vision':{'enabled':True}}},{'id':'unrelated','config':{'keep':123}}]
            config=profile/'cordis.patch.yml';config.write_text(yaml.safe_dump(rows,allow_unicode=True),encoding='utf-8')
            def qq_config(_):
                raw=config.read_bytes();data=yaml.load(raw,Loader=PromptLoader);return config,raw,data,data[0]['config']
            def commit(file,data,*_):
                file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
            def switch(provider):
                file=root/'data/model-routing.json';raw=file.read_bytes() if file.exists() else b''
                payload={'version':hashlib.sha256(raw).hexdigest(),'provider':provider,'model':'gpt-6-luna'}
                with patch.object(control_models,'chat_ui_snapshot',return_value={}):
                    control_models.save(root,profile,payload,commit,qq_config,lambda x:json.dumps(x).encode(),RuntimeError)
            switch('codex');self.assertEqual(qq_config(profile)[3]['provider'],'codex')
            switch('deepseek-account');data=qq_config(profile)[2];self.assertEqual(data[0]['config']['model'],'deepseek-flash')
            self.assertEqual(data[0]['config']['directPrompt'],'柚柚 live persona');self.assertEqual(data[0]['config']['custom'],42)
            self.assertEqual(data[1],rows[1]);self.assertEqual((memory/'keep.txt').read_text(),'same private memory')

    def test_chat_work_route_requires_a_work_page_probe(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);profile=root/'profile';profile.mkdir()
            rows=[{'id':'im-qqbot','config':{'provider':'deepseek-account','model':'deepseek-flash','cwd':'shared-memory','vision':{'enabled':True}}},{'id':'agent-default-model','config':{} }]
            config=profile/'cordis.patch.yml';config.write_text(yaml.safe_dump(rows,allow_unicode=True),encoding='utf-8')
            def qq_config(_):
                raw=config.read_bytes();data=yaml.load(raw,Loader=PromptLoader);return config,raw,data,data[0]['config']
            def commit(file,data,*_):
                file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
            route_file=root/'data/model-routing.json';route_file.parent.mkdir();route_file.write_text(json.dumps({'deepseek':{'provider':'deepseek-account','model':'deepseek-flash'}}))
            payload={'version':hashlib.sha256(route_file.read_bytes()).hexdigest(),'provider':'chatgpt-chat-work','model':'browser-chat'}
            work={'connected':True,'mode':'chat','work':True,'tested':True}
            with patch.object(control_models,'chat_ui_snapshot',return_value=work):
                control_models.save(root,profile,payload,commit,qq_config,lambda x:json.dumps(x).encode(),RuntimeError)
            self.assertEqual(json.loads(route_file.read_text())['provider'],'chatgpt-chat-work')
            saved=qq_config(profile)[3]
            self.assertEqual(saved['provider'],'chatgpt-chat-work')
            self.assertEqual(saved['vision']['provider'],'chatgpt-chat-work')
            route_file.write_text(json.dumps({'deepseek':{'provider':'deepseek-account','model':'deepseek-flash'}}))
            payload['version']=hashlib.sha256(route_file.read_bytes()).hexdigest()
            with patch.object(control_models,'chat_ui_snapshot',return_value={**work,'tested':False}):
                with self.assertRaises(ValueError):
                    control_models.save(root,profile,payload,commit,qq_config,lambda x:json.dumps(x).encode(),RuntimeError)

if __name__=='__main__':unittest.main()
