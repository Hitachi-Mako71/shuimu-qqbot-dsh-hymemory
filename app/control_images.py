"""Private image settings and job summaries for the desktop console."""
import hashlib
import json
from pathlib import Path
import re
import time
import uuid

DEFAULTS = {'enabled': False, 'auto': False, 'dailyMax': 6, 'minMinutes': 60,
            'manualDailyMax': 20, 'timeoutMinutes': 30, 'characterEnabled': True}
LABELS = {'submitting': '正在提交', 'queued': '等待生成/发送', 'delivered': 'QQ已接受图片与正文',
          'fallback-delivered': '已退回文字', 'canceled': '已取消', 'uncertain': '发送未确认',
          'queue-unconfirmed': '入队未确认', 'sending': '正在发送'}
REASONS = {'generation-timeout': '生成等待超时', 'generation-unavailable': '内置生图未完成',
           'qq-timeout': 'QQ发送等待超时，不自动重发', 'qq-send-unconfirmed': 'QQ未确认发送，请先检查私聊',
           'user-canceled': '你取消了任务', 'disabled-paused-quiet-or-waiting': '开关、静默或等待回复规则取消了发送'}


def read(path, fallback):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else fallback


def configuration(project):
    directory = project / 'data/codex-images'
    raw = read(directory / 'images-settings.json', {})
    return {**DEFAULTS, **raw, 'auto': False}


def revision(value):
    view = {key: value.get(key, default) for key, default in DEFAULTS.items()}
    return hashlib.sha256(json.dumps(view, sort_keys=True).encode()).hexdigest()


def snapshot(project):
    directory = project / 'data/codex-images'
    cfg = read(directory / 'config.json', {})
    relay = read(directory / 'binding.json', {})
    state = read(directory / 'images-state.json', {'jobs': []})
    settings = configuration(project)
    character = read(project / 'data/character/profile.json', {})
    jobs = []
    for job in state.get('jobs', [])[-30:][::-1]:
        if job.get('kind') != 'manual':
            continue
        jobs.append({'id': job['id'], 'status': job.get('status', ''), 'label': LABELS.get(job.get('status'), '待确认'),
                     'kind': '日常配图' if job.get('kind') == 'life' else '手动画图', 'caption': job.get('caption', '')[:350],
                     'createdAt': job.get('createdAt'), 'reason': REASONS.get(job.get('reason'), ''),
                     'canCancel': job.get('status') in ('submitting', 'queued'), 'canRetry': job.get('status') == 'uncertain'})
    canonical = next((v for v in character.get('references', []) if v.get('role') == 'canonical'), {})
    file = project / 'data/character' / canonical.get('file', 'missing')
    return {'settings': {key: settings[key] for key in DEFAULTS}, 'version': revision(settings),
            'configured': bool(cfg.get('imageRoot') and relay.get('owner') and cfg.get('threadId') == relay.get('threadId')),
            'jobs': jobs, 'character': character.get('description', ''), 'characterReady': file.is_file(),
            'active': sum(j['canCancel'] for j in jobs)}


def save(project, payload, commit, conflict_type):
    directory = project / 'data/codex-images'
    cfg, relay = read(directory / 'config.json', {}), read(directory / 'binding.json', {})
    if not cfg.get('imageRoot') or not relay.get('owner') or cfg.get('threadId') != relay.get('threadId'):
        raise ValueError('生图尚未完成本机配对配置，不能从控制台开启。')
    path = directory / 'images-settings.json'
    raw = path.read_bytes() if path.exists() else b''
    settings = configuration(project)
    if payload.get('version') != revision(settings):
        raise conflict_type('生图设置已经变化，请重新载入后再保存。')
    for key in ('enabled', 'auto', 'characterEnabled'):
        if type(payload.get(key)) is not bool:
            raise ValueError('生图开关无效。')
    for key, low, high in [('dailyMax', 1, 24), ('minMinutes', 20, 1440), ('manualDailyMax', 1, 100), ('timeoutMinutes', 5, 120)]:
        if type(payload.get(key)) is not int or not low <= payload[key] <= high:
            raise ValueError(f'{key}应在{low}至{high}之间。')
    settings.update({key: payload[key] for key in DEFAULTS})
    settings['auto'] = False
    commit(path, json.dumps(settings, ensure_ascii=False, indent=2).encode(), hashlib.sha256(raw).hexdigest(), project / '.run/control-console/backups')


def control_job(project, payload, action, commit):
    job_id = str(payload.get('id', ''))
    if not re.fullmatch(r'[a-f0-9-]{36}', job_id):
        raise ValueError('请选择已有生图任务。')
    state = read(project / 'data/codex-images/images-state.json', {'jobs': []})
    job = next((j for j in state['jobs'] if j['id'] == job_id), None)
    if job is None:
        raise ValueError('这个任务已经不存在，请刷新。')
    allowed = ('submitting', 'queued') if action == 'CancelImage' else ('uncertain',)
    if job.get('status') not in allowed:
        raise ValueError('任务状态已经改变，请刷新后再操作。')
    if action == 'RetryImage' and not payload.get('confirmed') is True:
        raise ValueError('重发前请确认QQ是否已经收到，避免重复发送。')
    content = {'type': 'cancel' if action == 'CancelImage' else 'retry-send', 'jobId': job_id, 'createdAt': int(time.time() * 1000)}
    commit(project / 'data/codex-images/image-controls' / (str(uuid.uuid4()) + '.json'), json.dumps(content).encode())


def preview(project, payload):
    directory = project / 'data/codex-images'
    cfg, relay = read(directory / 'config.json', {}), read(directory / 'binding.json', {})
    if payload.get('id') == 'character':
        character = read(project / 'data/character/profile.json', {})
        item = next((v for v in character.get('references', []) if v.get('role') == 'canonical'), {})
        folder = (project / 'data/character').resolve()
        image = (folder / item.get('file', 'missing')).resolve(strict=True)
        expected = item.get('sha256')
    else:
        job = next((j for j in read(directory / 'images-state.json', {'jobs': []})['jobs'] if j['id'] == payload.get('id')), None)
        if not job or job.get('owner') != relay.get('owner') or cfg.get('threadId') != relay.get('threadId'):
            raise ValueError('只能预览当前配对私聊的生图任务。')
        root = Path(cfg['imageRoot']).resolve(strict=True)
        folder = (root / job['id']).resolve(strict=True)
        folder.relative_to(root)
        manifest = (folder / 'ready.json').resolve(strict=True)
        manifest.relative_to(folder)
        ready = read(manifest, {})
        if ready.get('id') != job['id'] or ready.get('nonce') != job.get('nonce') or ready.get('extension') not in ('png', 'jpg', 'webp'):
            raise ValueError('图片尚未准备好，或图片交付信息不匹配。')
        image = (folder / ('image.' + ready['extension'])).resolve(strict=True)
        expected = ready.get('sha256')
    image.relative_to(folder)
    if image.stat().st_size > 30 * 1024 * 1024 or hashlib.sha256(image.read_bytes()).hexdigest() != expected:
        raise ValueError('图片完整性检查未通过。')
    return {'path': str(image)}
