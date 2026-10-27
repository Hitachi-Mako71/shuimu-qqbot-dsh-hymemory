"""Validate gateway identity and derive the existing QQ memory partition."""
import hashlib
import json
import re


def namespace(identity):
    raw = json.dumps([identity['appId'], identity['scope'], identity['peerId']],
                     ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return 'qq-' + hashlib.sha256(raw).hexdigest()


def validate_request(body, expected_app, data, operation):
    identity = body.get('identity')
    if not expected_app or not isinstance(identity, dict):
        raise PermissionError('gateway identity is required')
    for field in ('appId', 'peerId', 'senderId'):
        if not isinstance(identity.get(field), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,256}', identity[field]):
            raise PermissionError('invalid gateway identity')
    if identity['appId'] != str(expected_app) or identity.get('scope') not in ('c2c', 'group'):
        raise PermissionError('identity owner or space is invalid')
    if identity['scope'] == 'c2c' and identity['senderId'] != identity['peerId']:
        raise PermissionError('private actor does not match space')
    user_id = namespace(identity)
    if ('user_id' in body and body['user_id'] != user_id) or ('scope' in body and body['scope'] != identity['scope']):
        raise PermissionError('identity partition mismatch')
    if any(key in body for key in ('bank', 'bank_id', 'owner', 'space', 'actor', 'user_ids', 'agent_id', 'agent_ids')):
        raise PermissionError('caller-selected memory partitions are not allowed')
    if body.get('mode', 'chat') != 'chat':
        raise PermissionError('memory is disabled outside chat mode')
    if identity['scope'] == 'group':
        registry = data / 'companion/groups/registry.json'
        try:
            room = json.loads(registry.read_text(encoding='utf-8-sig')).get('rooms', {}).get(user_id, {})
        except (OSError, ValueError, AttributeError):
            room = {}
        if room.get('enabled') is not True or not room.get('controller'):
            raise PermissionError('group memory collection is not authorized')
        if operation in ('/delete','/lifecycle/preview','/lifecycle/confirm','/lifecycle/retry') and room['controller'] != identity['senderId']:
            raise PermissionError('only the bound group controller can delete group memory')
    return user_id
