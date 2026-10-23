"""Enable C2C streaming only in the dedicated QQ profile; keep existing data."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import shutil
import yaml
from personality_config import PromptLoader, PromptDumper

parser = argparse.ArgumentParser()
parser.add_argument('--profile', required=True)
parser.add_argument('--no-streaming', action='store_true')
args = parser.parse_args()
profile = Path(args.profile).resolve()
if profile.name != 'qqbot':
    raise SystemExit('Expected the dedicated qqbot profile')
target = profile / 'cordis.patch.yml'
rows = yaml.load(target.read_text(encoding='utf-8-sig'), Loader=PromptLoader)
matches = [row for row in rows if row.get('id') == 'im-qqbot']
if len(matches) != 1:
    raise SystemExit('Expected one QQ plugin configuration')
matches[0].setdefault('config', {})['streaming'] = not args.no_streaming
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
shutil.copy2(target, target.with_name('cordis.patch.before-response-speed-' + stamp + '.yml.bak'))
target.write_text(yaml.dump(rows, Dumper=PromptDumper, sort_keys=False, allow_unicode=True, width=1000), encoding='utf-8')
print('QQ C2C streaming configured; sessions and identity settings preserved.')
