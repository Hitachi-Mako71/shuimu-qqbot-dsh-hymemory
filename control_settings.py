"""Private local configuration operations for the desktop controller. No network calls."""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import time
import zipfile

import yaml
import control_images
import control_models
import control_reading
from personality_config import GROUP_STYLE, PromptLoader, PromptDumper

CHINA = timezone(timedelta(hours=8))
FREQUENCIES = {'high': (20, 30, 3), 'normal': (60, 120, 1), 'light': (180, 360, 1)}
COMP_FIELDS = ('enabled', 'minMinutes', 'maxMinutes', 'hourlyMax', 'dailyMax', 'quietDisabled', 'quietStart', 'quietEnd', 'owner', 'target')


class ConfigConflict(ValueError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def version(value):
    return digest(json.dumps(value, sort_keys=True, ensure_ascii=False).encode())


def read_json(path, fallback=None):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else fallback


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def commit(path, data, expected=None, backup_dir=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    before = path.read_bytes() if path.exists() else b''
    if expected is not None and digest(before) != expected:
        raise ConfigConflict('配置已被其他操作更新，请重新载入后再保存。')
    if backup_dir and before:
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(CHINA).strftime('%Y%m%d-%H%M%S-%f')
        shutil.copy2(path, backup_dir / (path.name + '.' + stamp + '.bak'))
    handle, temporary = tempfile.mkstemp(prefix='.' + path.name + '.control-', dir=path.parent)
    try:
        with os.fdopen(handle, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        for attempt in range(5):
            if expected is not None and digest(path.read_bytes() if path.exists() else b'') != expected:
                raise ConfigConflict('配置已被其他操作更新，请重新载入后再保存。')
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if attempt == 4:
                    raise ValueError('配置文件暂被占用，请稍后再保存。')
                time.sleep(0.05)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def comp_version(settings):
    return version({key: settings.get(key) for key in COMP_FIELDS})


def group_version(room):
    return version({key: room.get(key) for key in ('enabled', 'frequency', 'controller')})


def qq_config(profile):
    if profile.name != 'qqbot':
        raise ValueError('只允许修改独立的qqbot配置。')
    path = profile / 'cordis.patch.yml'
    raw = path.read_bytes()
    rows = yaml.load(raw.decode('utf-8-sig'), Loader=PromptLoader)
    matches = [row for row in rows if row.get('id') == 'im-qqbot']
    if len(matches) != 1:
        raise ValueError('没有找到唯一的QQ机器人配置。')
    return path, raw, rows, matches[0].setdefault('config', {})


def snapshot(project, profile):
    companion = read_json(project / 'data/companion/settings.json', {})
    registry = read_json(project / 'data/companion/groups/registry.json', {'rooms': {}})
    preferences = read_json(project / 'data/control-console/preferences.json', {'groups': {}})
    _, _, _, config = qq_config(profile)
    persona_path = project / 'personality.md'
    persona_raw = persona_path.read_bytes()
    frequency = next((key for key, values in FREQUENCIES.items() if tuple(companion.get(k) for k in ('minMinutes', 'maxMinutes', 'hourlyMax')) == values), 'custom')
    groups = []
    for key, room in registry.get('rooms', {}).items():
        groups.append({'key': key, 'code': 'G' + key[-10:].upper(),
                       'alias': preferences.get('groups', {}).get(key, ''),
                       'enabled': bool(room.get('enabled')), 'bound': bool(room.get('controller')),
                       'frequency': room.get('frequency', '正常'), 'messages': room.get('allMessages', 0),
                       'sent': room.get('sent', 0), 'status': room.get('status', '等待群消息'),
                       'version': group_version(room)})
    return {'companion': {'enabled': bool(companion.get('enabled')), 'paired': bool(companion.get('owner') and companion.get('target')),
                          'frequency': frequency, 'minMinutes': companion.get('minMinutes', 20),
                          'maxMinutes': companion.get('maxMinutes', 30), 'hourlyMax': companion.get('hourlyMax', 3),
                          'dailyMax': companion.get('dailyMax', 42), 'quietDisabled': bool(companion.get('quietDisabled')),
                          'quietStart': companion.get('quietStart', 23), 'quietEnd': companion.get('quietEnd', 9),
                          'version': comp_version(companion)},
            'groups': groups, 'persona': persona_raw.decode('utf-8-sig'), 'personaVersion': digest(persona_raw),
            'streaming': bool(config.get('streaming')), 'provider': config.get('provider', ''), 'model': config.get('model', ''),
            'images': control_images.snapshot(project), 'chatModel': control_models.snapshot(project, config),
            'restartRequired': (project / '.run/control-console/restart-required.json').exists()}


def require_bool(payload, key):
    if type(payload.get(key)) is not bool:
        raise ValueError('开关设置无效，请重新载入配置。')
    return payload[key]


def save_companion(project, payload):
    path = project / 'data/companion/settings.json'
    raw = path.read_bytes()
    settings = json.loads(raw.decode('utf-8-sig'))
    if payload.get('version') != comp_version(settings):
        raise ConfigConflict('主动消息设置已经变化，请重新载入后再保存。')
    enabled = require_bool(payload, 'enabled')
    quiet = require_bool(payload, 'quietDisabled')
    frequency = payload.get('frequency')
    if frequency not in (*FREQUENCIES, 'custom'):
        raise ValueError('请选择有效的主动消息频率。')
    daily = payload.get('dailyMax')
    if type(daily) is not int or not 1 <= daily <= 72:
        raise ValueError('每天的主动消息上限应为1至72条。')
    if enabled and not settings.get('enabled'):
        settings['snoozeUntil'] = 0
    settings.update(enabled=enabled, quietDisabled=quiet, dailyMax=daily)
    if frequency != 'custom':
        settings.update(zip(('minMinutes', 'maxMinutes', 'hourlyMax'), FREQUENCIES[frequency]))
    commit(path, encoded(settings), digest(raw), project / '.run/control-console/backups')


def save_group(project, payload):
    path = project / 'data/companion/groups/registry.json'
    key = str(payload.get('key', ''))
    if not re.fullmatch(r'qq-[a-f0-9]{64}', key):
        raise ValueError('请选择已有群聊。')
    enabled = require_bool(payload, 'enabled')
    frequency = payload.get('frequency')
    if frequency not in ('安静', '正常', '活跃'):
        raise ValueError('请选择有效的群聊频率。')
    alias = str(payload.get('alias', '')).strip()
    if len(alias) > 40 or any(ord(char) < 32 for char in alias):
        raise ValueError('群备注应为不超过40字的单行文字。')
    for attempt in range(5):
        raw = path.read_bytes()
        state = json.loads(raw.decode('utf-8-sig'))
        room = state.get('rooms', {}).get(key)
        if room is None or payload.get('version') != group_version(room):
            raise ConfigConflict('这个群的设置已经变化，请重新载入后再保存。')
        if enabled and not room.get('controller'):
            raise ValueError('这个群尚未绑定，请先在QQ完成群友模式绑定。')
        room.update(enabled=enabled, frequency=frequency)
        try:
            commit(path, encoded(state), digest(raw), project / '.run/control-console/backups')
            break
        except ConfigConflict:
            if attempt == 4:
                raise
            time.sleep(0.04)
    preferences_path = project / 'data/control-console/preferences.json'
    preferences = read_json(preferences_path, {'groups': {}})
    preferences.setdefault('groups', {})[key] = alias
    commit(preferences_path, encoded(preferences))


def save_profile(project, profile, action, payload):
    path, raw, rows, config = qq_config(profile)
    persona_path = project / 'personality.md'
    persona_raw = persona_path.read_bytes()
    if action == 'SavePersona':
        if payload.get('version') != digest(persona_raw):
            raise ConfigConflict('人设已被其他操作更新，请重新载入后再保存。')
        text = str(payload.get('text', '')).strip()
        if not 20 <= len(text) <= 60000:
            raise ValueError('人设提示词应为20至60000个字符。')
        text += '\n'
        config['directPrompt'] = text
        config['groupPrompt'] = text + GROUP_STYLE
    else:
        if payload.get('previous') is not bool(config.get('streaming')):
            raise ConfigConflict('回复方式已被其他操作更新，请重新载入后再保存。')
        config['streaming'] = require_bool(payload, 'enabled')
    serialized = yaml.dump(rows, Dumper=PromptDumper, sort_keys=False, allow_unicode=True, width=1000).encode()
    backups = project / '.run/control-console/backups'
    commit(path, serialized, digest(raw), backups)
    if action == 'SavePersona':
        try:
            commit(persona_path, text.encode(), digest(persona_raw), backups)
        except Exception:
            # Roll back only if the profile is still exactly the version we just wrote.
            commit(path, raw, digest(serialized))
            raise
    commit(project / '.run/control-console/restart-required.json', encoded({'reason': action, 'at': datetime.now(CHINA).isoformat()}))


def sanitize(project, text):
    secrets = []
    credentials = read_json(project / 'qq.credentials.json', {})
    if credentials.get('appSecret'):
        secrets.append(credentials['appSecret'])
    env = project / '.env'
    if env.exists():
        for line in env.read_text(encoding='utf-8-sig').splitlines():
            if '=' in line:
                key, value = line.split('=', 1)
                if any(token in key.upper() for token in ('TOKEN', 'SECRET', 'API_KEY')) and len(value.strip().strip('"\'')) >= 8:
                    secrets.append(value.strip().strip('"\''))
    for secret in secrets:
        text = text.replace(secret, '[凭证已隐藏]')
    return re.sub(r'(?i)(Bearer\s+)[A-Za-z0-9._~+/-]{8,}', r'\1[凭证已隐藏]', text)


def logs(project, payload):
    channels = {'qq-out': 'qqbot.out.log', 'qq-error': 'qqbot.err.log', 'memory-out': 'memory.out.log', 'memory-error': 'memory.err.log'}
    name = channels.get(payload.get('channel'))
    if not name:
        raise ValueError('请选择有效的日志。')
    path = project / 'logs' / name
    if not path.exists():
        return {'text': '尚未生成这份日志。', 'channel': payload['channel']}
    # Windows shared file handles are required while PowerShell redirects output.
    if os.name == 'nt':
        import ctypes
        import msvcrt
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        create = kernel.CreateFileW
        create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        create.restype = wintypes.HANDLE
        handle = create(str(path), 0x80000000, 0x1 | 0x2 | 0x4, None, 3, 0x80, None)
        if handle == wintypes.HANDLE(-1).value:
            raise ValueError('日志暂时不可读，请稍后刷新。')
        descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
        stream = os.fdopen(descriptor, 'rb')
    else:
        stream = path.open('rb')
    with stream:
        stream.seek(0, 2)
        stream.seek(max(0, stream.tell() - 65536))
        content = stream.read().decode('utf-8-sig', errors='replace')
    lines = content.splitlines()[-200:]
    return {'text': sanitize(project, '\n'.join(lines)) or '暂无日志内容。', 'channel': payload['channel']}


def backup(project, profile):
    destination = project / 'exports' / ('yuzu-config-' + datetime.now(CHINA).strftime('%Y%m%d-%H%M%S-%f') + '.zip')
    destination.parent.mkdir(parents=True, exist_ok=True)
    _, _, _, config = qq_config(profile)
    safe_bot = {key: config.get(key) for key in ('provider', 'model', 'streaming')}
    with zipfile.ZipFile(destination, 'x', zipfile.ZIP_DEFLATED) as archive:
        for relative in ('personality.md', 'fiction-canon.json', 'data/companion/settings.json', 'data/companion/groups/registry.json', 'data/control-console/preferences.json', 'data/codex-relay/images-settings.json', 'data/character/profile.json'):
            path = project / relative
            if path.exists():
                archive.writestr(relative, sanitize(project, path.read_text(encoding='utf-8-sig')))
        archive.writestr('bot-settings.json', json.dumps(safe_bot, ensure_ascii=False, indent=2))
        character = read_json(project / 'data/character/profile.json', {})
        character_dir = (project / 'data/character').resolve()
        for item in character.get('references', []):
            name = str(item.get('file', ''))
            if not re.fullmatch(r'[a-zA-Z0-9-]+\.(?:png|jpe?g)', name):
                continue
            file = (character_dir / name).resolve()
            if file.is_relative_to(character_dir) and file.is_file() and file.stat().st_size <= 30 * 1024 * 1024:
                archive.writestr('data/character/' + name, file.read_bytes())
        archive.writestr('README.txt', '本机配置快照，可能包含身份分区信息，请自行保管。未包含Secret、Token、DSH登录、聊天记录或记忆数据库。\n')
    return {'path': str(destination)}


def perform(project, profile, action, payload):
    if action.startswith('Reading'):
        return control_reading.perform(project, action, payload)
    if action == 'Snapshot':
        return snapshot(project, profile)
    if action == 'SaveCompanion':
        save_companion(project, payload)
    elif action == 'SaveGroup':
        save_group(project, payload)
    elif action in ('SavePersona', 'SaveStreaming'):
        save_profile(project, profile, action, payload)
    elif action == 'SaveImages':
        control_images.save(project, payload, commit, ConfigConflict)
    elif action == 'SaveModel':
        control_models.save(project, profile, payload, commit, qq_config, encoded, ConfigConflict)
    elif action in ('CancelImage', 'RetryImage'):
        control_images.control_job(project, payload, action, commit)
    elif action == 'ImagePreview':
        return control_images.preview(project, payload)
    elif action == 'ImageTasks':
        return control_images.snapshot(project)
    elif action == 'ImageProbe':
        import uuid
        commit(project / 'data/companion/control' / (str(uuid.uuid4()) + '.json'), encoded({'type': 'share_verified_image', 'createdAt': int(time.time() * 1000)}))
    elif action == 'Logs':
        return logs(project, payload)
    elif action == 'Backup':
        return backup(project, profile)
    else:
        raise ValueError('不支持的控制台操作。')
    return {'restartRequired': action in ('SavePersona', 'SaveStreaming'), 'snapshot': snapshot(project, profile)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', required=True)
    parser.add_argument('--profile', required=True)
    parser.add_argument('--action', required=True)
    parser.add_argument('--request')
    parser.add_argument('--result', required=True)
    args = parser.parse_args()
    project, profile = Path(args.project).resolve(), Path(args.profile).resolve()
    result_path = Path(args.result).resolve()
    try:
        data = perform(project, profile, args.action, read_json(Path(args.request), {}) if args.request else {})
        result = {'success': True, 'data': data}
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else '操作未完成，请查看本机日志或重新载入配置。'
        if isinstance(error, json.JSONDecodeError):
            message = '配置文件格式未读完整，请重新载入后再试。'
        result = {'success': False, 'message': message, 'conflict': isinstance(error, ConfigConflict)}
    commit(result_path, encoded(result))
    return 0 if result['success'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
