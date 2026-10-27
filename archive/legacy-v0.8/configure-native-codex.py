"""Locate the installed Codex without reading or copying account credentials."""
import argparse
import json
import os
from pathlib import Path
import shutil

def configure(project, codex_home=None, codex_path=None):
    target = project / 'data/codex-work/config.json'
    if target.exists():
        return False
    candidates = [codex_path, shutil.which('codex'), str(Path.home() / '.codex/bin/codex.exe')]
    executable = next((Path(p) for p in candidates if p and Path(p).is_file()), None)
    homes = [codex_home, os.environ.get('CODEX_HOME'), 'D:/CodexData/.codex', str(Path.home() / '.codex')]
    home = next((Path(p) for p in homes if p and Path(p).is_dir()), None)
    if not executable or not home:
        raise ValueError('请先安装并登录Codex，或指定 --codex-path 和 --codex-home。')
    workspace = project / 'data/memory-workspace'
    workspace.mkdir(parents=True, exist_ok=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = {'codexPath': str(executable.resolve()), 'codexHome': str(home.resolve()), 'cwd': str(workspace.resolve())}
    # Exclusive creation: never replace an existing installation's settings.
    with target.open('x', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--codex-home')
    parser.add_argument('--codex-path')
    args = parser.parse_args()
    configure(args.project, args.codex_home, args.codex_path)
    print('Codex local settings ready; account credentials were not copied.')
