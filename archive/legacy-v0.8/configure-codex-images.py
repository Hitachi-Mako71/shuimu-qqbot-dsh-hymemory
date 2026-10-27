"""Configure native image jobs for an already paired Codex/QQ private chat."""
import argparse
import json
from pathlib import Path


def configure(project, image_root, helper, enabled=False, auto=False):
    directory = Path(project).resolve() / 'data' / 'codex-relay'
    cfg_file = directory / 'config.json'
    cfg = json.loads(cfg_file.read_text(encoding='utf-8-sig'))
    paired = json.loads((directory / 'state.json').read_text(encoding='utf-8-sig'))
    if not paired.get('owner') or paired.get('threadId') != cfg.get('threadId'):
        raise ValueError('Pair the QQ private chat to Codex first')
    image_root = Path(image_root).resolve()
    image_root.mkdir(parents=True, exist_ok=True)
    helper = Path(helper).resolve(strict=True)
    cfg.update(imageRoot=str(image_root), imageHelper=str(helper), imagePython=str(Path(project).resolve() / '.venv/Scripts/python.exe'))
    temp = cfg_file.with_suffix('.images.tmp')
    temp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(cfg_file)
    state_file = directory / 'images-state.json'
    state = json.loads(state_file.read_text(encoding='utf-8-sig')) if state_file.exists() else {'enabled': False, 'auto': False, 'jobs': []}
    if enabled:
        state['enabled'] = True
    if auto:
        state['auto'] = True
    temp = state_file.with_suffix('.images.tmp')
    temp.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
    temp.replace(state_file)
    settings_file = directory / 'images-settings.json'
    options = json.loads(settings_file.read_text(encoding='utf-8-sig')) if settings_file.exists() else {'enabled': state['enabled'], 'auto': state['auto'], 'dailyMax': 6, 'minMinutes': 60, 'manualDailyMax': 20, 'timeoutMinutes': 30, 'characterEnabled': True}
    if enabled:
        options['enabled'] = True
    if auto:
        options['auto'] = True
    temp = settings_file.with_suffix('.images.tmp')
    temp.write_text(json.dumps(options, ensure_ascii=False), encoding='utf-8')
    temp.replace(settings_file)
    print(json.dumps({'configured': True, 'enabled': state['enabled'], 'auto': state['auto'], 'text_sync_unchanged': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', default=str(Path(__file__).resolve().parent))
    parser.add_argument('--image-root', required=True)
    parser.add_argument('--helper', default=str(Path(__file__).resolve().parent / 'tools' / 'complete-codex-image.py'))
    parser.add_argument('--enable', action='store_true')
    parser.add_argument('--auto', action='store_true')
    args = parser.parse_args()
    configure(args.project, args.image_root, args.helper, args.enable, args.auto)
