"""Install user-selected character references locally; never calls an image API."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import time


def install(project, outfit, face, canonical, replace=False):
    project = Path(project).resolve(strict=True)
    directory = project / 'data/character'
    current = directory / 'profile.json'
    old = json.loads(current.read_text(encoding='utf-8-sig')) if current.exists() else {}
    if old and not replace:
        raise ValueError('Character is already configured; use --replace only for a user-approved visual change')
    description = (project / 'character-appearance.md').read_text(encoding='utf-8-sig')
    images = []
    for role, source in [('outfit', outfit), ('face', face), ('canonical', canonical)]:
        source = Path(source).resolve(strict=True)
        data = source.read_bytes()
        extension = 'png' if data.startswith(b'\x89PNG\r\n\x1a\n') else 'jpg' if data.startswith(b'\xff\xd8\xff') else None
        if not extension or not 0 < len(data) <= 30 * 1024 * 1024:
            raise ValueError('Reference must be a PNG/JPEG no larger than 30MB')
        images.append((role, data, extension))
    if old:
        backup = project / '.run/character-backups' / str(int(time.time() * 1000))
        shutil.copytree(directory, backup)
    directory.mkdir(parents=True, exist_ok=True)
    refs = []
    revision = old.get('revision', 0) + 1
    for role, data, extension in images:
        name = f'{role}-v{revision}.{extension}'
        (directory / name).write_bytes(data)
        refs.append({'role': role, 'file': name, 'sha256': hashlib.sha256(data).hexdigest()})
    profile = {'schema': 1, 'revision': revision, 'name': '柚柚', 'description': description, 'references': refs,
               'scope': 'protected-character-appearance', 'source': 'explicit user choice'}
    temporary = current.with_suffix('.tmp')
    temporary.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(current)
    print(json.dumps({'configured': True, 'reference_count': 3, 'revision': revision, 'api_calls': 0}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', default=str(Path(__file__).resolve().parent))
    parser.add_argument('--outfit', required=True)
    parser.add_argument('--face', required=True)
    parser.add_argument('--canonical', required=True)
    parser.add_argument('--replace', action='store_true')
    args = parser.parse_args()
    install(args.project, args.outfit, args.face, args.canonical, args.replace)
