"""Run real Hy Memory acceptance through the deployed loopback APIs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid
from dotenv import load_dotenv

parser = argparse.ArgumentParser()
parser.add_argument('--project', default=str(Path(__file__).parent))
parser.add_argument('--result', default='acceptance-local-results.json')
args = parser.parse_args()
load_dotenv(Path(args.project) / '.env', override=True)
token = os.environ['MEMORY_BRIDGE_TOKEN']
user_a = 'qq-' + hashlib.sha256(b'acceptance-user-A').hexdigest()
user_b = 'qq-' + hashlib.sha256(b'acceptance-user-B').hexdigest()
group = 'qq-' + hashlib.sha256(b'acceptance-group-G').hexdigest()
report = []
run_id = uuid.uuid4().hex


def call(path, user_id=user_a, **body):
    request = urllib.request.Request('http://127.0.0.1:8765' + path,
        data=json.dumps({'user_id': user_id, **body}, ensure_ascii=False).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=150) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def post(path, **body):
    status, payload = call(path, **body)
    assert status in (200, 202) and payload.get('ok'), f'{path} failed with HTTP {status}: {payload.get("error")}'
    return payload


def record(name, **detail):
    report.append({'check': name, 'passed': True, **detail})
    Path(args.result).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS ' + name, flush=True)


# Clear only the dedicated acceptance identities, so this script is repeatable.
for namespace in (user_a, user_b, group):
    for memory in post('/list', user_id=namespace)['memories']:
        post('/delete', user_id=namespace, id=memory['id'])
post('/add', text='我偏好简洁回答。', message_id='acceptance-write-1-' + run_id)
initial = post('/search', query='回答风格偏好是什么？')
assert any('简' in m['content'] for m in initial['memories'])
record('real extraction/write/semantic recall', sources=[{'id': m['id'], 'score': m['score']} for m in initial['memories']])

for label, namespace in [('other private user', user_b), ('group', group)]:
    isolated = post('/search', user_id=namespace, query='回答风格偏好是什么？')
    assert not isolated['memories'], f'{label} unexpectedly received another identity memory'
    record(label + ' isolation')

post('/add', text='我的回答偏好现在改了：以后请详细解释每个步骤，不再按之前的简洁偏好回答。', message_id='acceptance-update-2-' + run_id)
updated = post('/search', query='目前应简洁回答还是详细解释？')
assert any(('详细' in m['content'] or '步骤' in m['content']) for m in updated['memories'])
active = post('/list')['memories']
stale = [m for m in active if ('偏好简洁' in m['content'] or '喜欢简洁' in m['content']) and not any(word in m['content'] for word in ('详细', '之前', '不再', '改'))]
assert not stale, 'the previous preference remains active after conflict reconciliation'
record('new preference supersedes old preference', active_ids=[m['id'] for m in active])

target = updated['memories'][0]['id']
status, _ = call('/delete', user_id=user_b, id=target)
assert status == 404
record('cross-identity deletion rejected')
post('/delete', id=target)
remaining = post('/search', query='回答风格偏好是什么？')
assert target not in [m['id'] for m in remaining['memories']]
record('deleted memory no longer recalled', deleted_id=target)

job_id = hashlib.sha256(('acceptance-durable-blue-theme-' + run_id).encode()).hexdigest()
post('/enqueue', job_id=job_id, messages=[{'role': 'user', 'content': '我喜欢蓝色主题。'}], session_id='acceptance-session-independent', message_id='acceptance-auto-write-3')
deadline = time.monotonic() + 150
while time.monotonic() < deadline:
    rows = post('/list')['memories']
    if any('蓝色' in m['content'] for m in rows):
        record('automatic durable outbox writes through real SDK', source_ids=[m['id'] for m in rows if '蓝色' in m['content']])
        break
    time.sleep(2)
else:
    raise AssertionError('queued automatic write did not complete')
print('REAL_LOCAL_ACCEPTANCE_COMPLETE', flush=True)
