"""Copy archived locks into this installation without touching credentials or data."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project', required=True)
parser.add_argument('--dsh-home', required=True)
parser.add_argument('--part', choices=['runtime', 'profile', 'all'], default='all')
parser.add_argument('--force', action='store_true', help='Back up and replace an existing, different lock')
args = parser.parse_args()
project = Path(args.project).resolve()
archive = Path(__file__).resolve().parent.parent / 'dependency-locks'
profile = Path(args.dsh_home).resolve() / 'profiles/qqbot'
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')


def write(target, data):
    if target.exists():
        if target.read_bytes() == data:
            print('UNCHANGED ' + target.name)
            return
        if not args.force:
            raise SystemExit('Existing file differs; review first, then use --force: ' + str(target))
        shutil.copy2(target, target.with_name(target.name + '.before-lock-restore-' + stamp + '.bak'))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print('RESTORED ' + str(target))


if args.part in ('runtime', 'all'):
    origin = archive / 'runtime'
    target = project / 'runtime'
    if (target / 'package.json').exists():
        current = json.loads((target / 'package.json').read_text(encoding='utf-8-sig'))
        expected = json.loads((origin / 'package.json').read_text(encoding='utf-8-sig'))
        if current.get('dependencies') != expected.get('dependencies'):
            raise SystemExit('Runtime dependency manifest differs; refusing to replace custom dependencies')
    write(target / 'package.json', (origin / 'package.json').read_bytes())
    write(target / 'package-lock.json', (origin / 'package-lock.json').read_bytes())

if args.part in ('profile', 'all'):
    origin = archive / 'qqbot-profile'
    manifest_path = profile / 'package.json'
    if not manifest_path.exists():
        raise SystemExit('Install the dedicated qqbot profile before restoring its lock')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    expected = json.loads((origin / 'package.json').read_text(encoding='utf-8-sig'))
    deps = manifest.get('dependencies', {})
    expected_deps = expected.get('dependencies', {})
    if set(deps) != set(expected_deps) or deps.get('@tencent-connect/dsh-qqbot') != '0.5.2':
        raise SystemExit('QQ profile plugin set differs; refusing to replace custom dependencies')
    package = project / 'packages/dsh-hymemory-qq-0.3.1.tgz'
    if not package.exists():
        raise SystemExit('Expected the packaged companion plugin 0.3.1')
    file_reference = 'file:' + package.as_posix()
    current_reference = deps.get('dsh-hymemory-qq', '')
    if current_reference != file_reference:
        raise SystemExit('QQ profile must reference this installation companion tgz; run install-qqbot.ps1 first')
    patch = profile / 'patches/@tencent-connect__dsh-qqbot@0.5.2.patch'
    expected_hash = json.loads((project / 'versions.json').read_text(encoding='utf-8'))['qq_patch_sha256']
    if not patch.exists() or hashlib.sha256(patch.read_bytes()).hexdigest() != expected_hash:
        raise SystemExit('The installed QQ patch does not match the archived lock')
    text = (origin / 'pnpm-lock.yaml').read_text(encoding='utf-8')
    archived_reference = expected_deps['dsh-hymemory-qq']
    text = text.replace(archived_reference, file_reference)
    relative_reference = 'file:' + os.path.relpath(package, profile).replace('\\', '/')
    text = text.replace('file:../../../qqbot-hymemory/packages/dsh-hymemory-qq-0.3.1.tgz', relative_reference)
    write(profile / 'pnpm-lock.yaml', text.encode('utf-8'))
    print('Next: pnpm install --frozen-lockfile in ' + str(profile))
