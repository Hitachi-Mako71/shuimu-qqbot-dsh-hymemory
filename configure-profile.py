"""Configure only the dedicated qqbot profile and its pinned pnpm patch."""
import argparse
from pathlib import Path
import shutil
import yaml
from personality_config import apply_personality

parser = argparse.ArgumentParser()
parser.add_argument('--project', required=True)
parser.add_argument('--profile', required=True)
args = parser.parse_args()
project = Path(args.project).resolve()
profile = Path(args.profile).resolve()
if profile.name != 'qqbot' or not (profile / 'package.json').is_file():
    raise SystemExit('Expected an installed, dedicated qqbot profile')
patch_name = '@tencent-connect__dsh-qqbot@0.5.2.patch'
(profile / 'patches').mkdir(exist_ok=True)
shutil.copy2(project / 'patches' / patch_name, profile / 'patches' / patch_name)
workspace = profile / 'pnpm-workspace.yaml'
config = yaml.safe_load(workspace.read_text(encoding='utf-8')) if workspace.exists() else {}
config = config or {}
config.setdefault('packages', ['.'])
config.setdefault('nodeLinker', 'hoisted')
config.setdefault('autoInstallPeers', False)
config.setdefault('patchedDependencies', {})['@tencent-connect/dsh-qqbot@0.5.2'] = 'patches/' + patch_name
workspace.write_text(yaml.safe_dump(config, sort_keys=False), encoding='utf-8')
target = profile / 'cordis.patch.yml'
backup = profile / 'cordis.patch.before-hymemory.yml.bak'
if target.exists() and not backup.exists():
    shutil.copy2(target, backup)
template = (project / 'dsh-qqbot.patch.yml').read_text(encoding='utf-8')
target.write_text(template.replace('__PROJECT_DIR__', project.as_posix().replace("'", "''")), encoding='utf-8')
apply_personality(project, profile, backup=False)
(project / 'agent-work').mkdir(exist_ok=True)
print('Configured dedicated qqbot profile; previous profile patch backed up once.')
