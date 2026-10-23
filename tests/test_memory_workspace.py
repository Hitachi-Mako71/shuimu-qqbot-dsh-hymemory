import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import yaml

ROOT=Path(__file__).parents[1]
sys.path.insert(0,str(ROOT))
from personality_config import PromptLoader,PromptDumper

class MemoryWorkspace(unittest.TestCase):
    def test_workspace_changes_only_cwd_and_preserves_existing_notes(self):
        file=ROOT/'memory_workspace.py'
        self.assertTrue(file.exists(),'Memory workspace configuration helper is missing')
        spec=importlib.util.spec_from_file_location('memory_workspace',file)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temp:
            project=Path(temp)/'project';project.mkdir()
            profile=Path(temp)/'profiles/qqbot';profile.mkdir(parents=True)
            (profile/'package.json').write_text('{}')
            (project/'personality.md').write_text('Live persona, keep intact',encoding='utf-8')
            rows=[{'id':'im-qqbot','config':{'provider':'chatgpt-plan','model':'gpt-6-luna','cwd':'old-cwd','directPrompt':'live prompt','groupPrompt':'live group','reasoningEffort':'off','unknown':{'keep':True}}},{'id':'other','config':{'keep':123}}]
            path=profile/'cordis.patch.yml';path.write_text(yaml.dump(rows,Dumper=PromptDumper),encoding='utf-8')
            workspace=project/'data/memory-workspace';workspace.mkdir(parents=True)
            (workspace/'notes.md').write_text('user notes',encoding='utf-8')
            module.configure(project,profile)
            after=yaml.load(path.read_text(encoding='utf-8'),Loader=PromptLoader)
            self.assertEqual(after[0]['config'].pop('cwd'),workspace.resolve().as_posix())
            rows[0]['config'].pop('cwd');self.assertEqual(after,rows)
            self.assertEqual((workspace/'notes.md').read_text(),'user notes')
            self.assertEqual((project/'personality.md').read_text(),'Live persona, keep intact')
            self.assertTrue((workspace/'AGENTS.md').exists())
            first=path.read_bytes();module.configure(project,profile);self.assertEqual(path.read_bytes(),first)
