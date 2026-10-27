"""DeepSeek-only conversation route for the desktop console."""
import hashlib
import json
from pathlib import Path


def read(path, fallback):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else fallback


def snapshot(project, bot_config):
    route_path = project / 'data/model-routing.json'
    route = read(route_path, {})
    selected = route.get('deepseek', {}).get('model')
    if route.get('provider') == 'deepseek-account':
        selected = selected or route.get('model')
    selected = selected or bot_config.get('deepseek', {}).get('model') or bot_config.get('model') or 'deepseek-flash'
    return {
        'provider': 'deepseek-account',
        'model': selected,
        'version': hashlib.sha256(route_path.read_bytes() if route_path.exists() else b'').hexdigest(),
        'memory': str(project / 'data/hy-memory'),
    }
