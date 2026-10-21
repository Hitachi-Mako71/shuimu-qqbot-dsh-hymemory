from pathlib import Path
import argparse
import json
import os
import urllib.request
import yaml

parser = argparse.ArgumentParser(description='Read only official model input capabilities; never print account tokens')
parser.add_argument('--dsh-home', default=os.environ.get('DSH_HOME', 'D:/DeepSeekHarnessData/home'))
args = parser.parse_args()
doc = yaml.safe_load((Path(args.dsh_home) / '.credentials.yaml').read_text(encoding='utf-8-sig'))
def find_account(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if str(key) == 'deepseek-account-platform/default':
                return value
        for value in node.values():
            found = find_account(value)
            if found is not None:
                return found
    return None
account = find_account(doc)
def find_token(node):
    if isinstance(node, str):
        if node.lstrip().startswith('{'):
            return find_token(json.loads(node))
        return node if node else None
    if isinstance(node, dict):
        for key in ('token', 'accessToken', 'access_token', 'value', 'payload'):
            if key in node:
                found = find_token(node[key])
                if found:
                    return found
    return None
token = find_token(account)
if not token:
    raise SystemExit('Account token could not be resolved; no credential values printed')
request = urllib.request.Request('https://api.deepseek.com/models', headers={'x-dsh-auth-token': token})
with urllib.request.urlopen(request, timeout=20) as response:
    data = json.load(response)
models = [{'id': row['id'], 'input_modalities': row.get('input_modalities', ['text'])} for row in data['data']]
destination = Path(__file__).resolve().parent.parent / 'data/diagnostics'
destination.mkdir(parents=True, exist_ok=True)
(destination / 'account-model-capabilities.json').write_text(json.dumps(models, indent=2), encoding='utf-8')
print(json.dumps(models))
