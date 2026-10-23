"""Local model switching, with a successful account probe before activation."""
import hashlib
import json
from pathlib import Path
import time
import urllib.request


def read(path, fallback):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else fallback


def snapshot(project, bot_config):
    directory = project / 'data/chatgpt-plan'
    credentials = read(directory / 'credentials.json', {})
    status = read(directory / 'status.json', {})
    route = read(project / 'data/model-routing.json', {})
    probe = read(directory / 'probe.json', {})
    native_dir = project / 'data/codex-work'
    native_status = read(native_dir / 'status.json', {})
    native_probe = read(native_dir / 'probe.json', {})
    native_runtime = read(native_dir / 'runtime.json', {})
    native_threads = read(native_dir / 'threads.private.json', {'threads': {}})['threads']
    return {'provider': route.get('provider', bot_config.get('provider', 'deepseek-account')),
            'model': route.get('model', bot_config.get('model', 'deepseek-flash')),
            'version': hashlib.sha256((project / 'data/model-routing.json').read_bytes() if (project / 'data/model-routing.json').exists() else b'').hexdigest(),
            'connected': bool(credentials.get('access_token') and 'chatgpt.tokens.use.direct' in credentials.get('scopes', [])),
            'account': credentials.get('email', ''), 'status': status.get('phase', ''), 'error': status.get('error', ''),
            'models': [{'id': m['id'], 'name': m['name']} for m in read(directory / 'models.json', {'models': []})['models']],
            'testedModel': probe.get('model') if probe.get('success') else '', 'expiresAt': credentials.get('expires_at'),
            'chatUI': chat_ui_snapshot(project),
            'deepseekModel': route.get('deepseek', {}).get('model', 'deepseek-flash'),
            'native': {'connected': native_status.get('connected', False),
                       'checkedAt': native_status.get('updatedAt'),
                       'probeAt': native_probe.get('updatedAt'),
                       'runtime': native_runtime,
                       'models': read(native_dir / 'models.json', {'models': []})['models'],
                       'testedModel': native_probe.get('model') if native_probe.get('success') else '',
                       'threadCount': len(native_threads),
                       'titles': [v.get('title', '柚柚QQ') for v in list(native_threads.values())[-8:]],
                       'workspace': str(project / 'data/memory-workspace'),
                       'memory': str(project / 'data/hy-memory')}}


def chat_ui_snapshot(project):
    state = {'connected': False, 'mode': 'unknown', 'temporary': False, 'work': False, 'status': 'bridge-offline'}
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open('http://127.0.0.1:8767/health', timeout=0.4) as response:
            health = json.load(response)
        if health.get('service') == 'yuzu-chat-ui':
            state.update({key: health.get(key) for key in state})
    except (OSError, ValueError):
        pass
    probe = read(project / 'data/chatgpt-chat/probe.json', {})
    state['tested'] = probe.get('success') is True and probe.get('purpose') == 'work'
    return state


def save(project, profile, payload, commit, qq_config, encoded, conflict_type):
    target = project / 'data/model-routing.json'
    raw = target.read_bytes() if target.exists() else b''
    if payload.get('version') != hashlib.sha256(raw).hexdigest():
        raise conflict_type('模型设置已发生变化，请重新载入。')
    provider, model = payload.get('provider'), payload.get('model')
    config_path, profile_raw, rows, bot = qq_config(profile)
    previous = read(target, {})
    baseline = previous.get('deepseek', {'provider': bot.get('provider', 'deepseek-account'), 'model': bot.get('model', 'deepseek-flash')})
    if baseline.get('provider') != 'deepseek-account':
        baseline = {'provider': 'deepseek-account', 'model': 'deepseek-flash'}
    if provider == 'codex':
        state = snapshot(project, bot)['native']
        if not state['connected'] or not any(m['id'] == model for m in state['models']):
            raise ValueError('请先刷新Codex模型，确认本机Codex已登录。')
        if state['testedModel'] != model:
            raise ValueError('请先验证所选Codex模型，再切换路由。')
    elif provider == 'chatgpt-plan':
        state = snapshot(project, bot)
        if not state['connected'] or not any(m['id'] == model for m in state['models']):
            raise ValueError('请先授权ChatGPT并选择账号提供的模型。')
        if state['testedModel'] != model:
            raise ValueError('请先点击“验证所选模型”，实际完成一次回复后再切换。')
    elif provider == 'deepseek-account':
        model = baseline['model']
    elif provider in ('chatgpt-chat','chatgpt-chat-work'):
        state = chat_ui_snapshot(project)
        ready = state['work'] if provider == 'chatgpt-chat-work' else state['temporary']
        if model != 'browser-chat' or not state['connected'] or state['mode'] != 'chat' or not ready or not state['tested']:
            raise ValueError('请先打开Chat网页工作标签页，并通过实际回复验证。')
    else:
        raise ValueError('不支持的对话提供方。')
    for row in rows:
        if row.get('id') in ('im-qqbot', 'agent-default-model'):
            cfg = row.setdefault('config', {})
            cfg.update(provider=provider, model=model)
            if row['id'] == 'im-qqbot' and cfg.get('vision', {}).get('enabled'):
                cfg['vision'].update(provider=provider, model=model)
    from personality_config import PromptDumper
    import yaml
    serialized = yaml.dump(rows, Dumper=PromptDumper, sort_keys=False, allow_unicode=True, width=1000).encode()
    backups = project / '.run/control-console/backups'
    commit(config_path, serialized, hashlib.sha256(profile_raw).hexdigest(), backups)
    try:
        route = {'provider': provider, 'model': model, 'deepseek': baseline, 'updatedAt': int(time.time() * 1000)}
        commit(target, encoded(route), hashlib.sha256(raw).hexdigest(), backups)
    except Exception:
        commit(config_path, profile_raw, hashlib.sha256(serialized).hexdigest())
        raise
    commit(project / '.run/control-console/restart-required.json', encoded({'reason': 'SaveModel', 'at': time.time()}))
