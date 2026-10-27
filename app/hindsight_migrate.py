"""Resumable source-backed migration; never overwrites the Hy store or deletion authority."""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from dotenv import dotenv_values
from hindsight_adapter import HindsightAdapter
from privacy_ledger import PrivacyLedger
from baseline_snapshot import protect
from memory_lifecycle import sources_from_meta
from export_memories import TEST_NAMESPACES


def atomic(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


def migrate(project):
    project = Path(project).resolve()
    ledger = PrivacyLedger(project / '.privacy/lifecycle.sqlite3')
    root = project / '.run/migrations/hindsight-1.1.0'
    root.mkdir(parents=True, exist_ok=True)
    protect(root)
    checkpoint = root / 'checkpoint.private.json'
    state = json.loads(checkpoint.read_text(encoding='utf-8')) if checkpoint.exists() else {
        'authority_id': ledger.authority_id(), 'completed': {}, 'started': datetime.now(timezone.utc).isoformat()}
    if state['authority_id'] != ledger.authority_id():
        raise RuntimeError('Deletion authority changed; migration cannot resume')
    state['completed']={key:value for key,value in state['completed'].items() if key.split(':',1)[0] not in TEST_NAMESPACES}
    originals = project / 'data/evidence/qq-evidence.sqlite3'
    # Online SQLite backup includes committed WAL; existing migration snapshots are immutable.
    databases = [originals, project / 'data/outbox.sqlite3', *sorted((project / 'data/hy-memory').rglob('*.sqlite3'))]
    for index, file in enumerate(databases):
        target = root / ('original-' + str(index) + '.sqlite3')
        if file.exists() and not target.exists():
            with sqlite3.connect('file:' + file.as_posix() + '?mode=ro', uri=True) as src, sqlite3.connect(target) as dst:
                src.backup(dst)
                if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise RuntimeError('Migration snapshot integrity failure')
    adapter = HindsightAdapter(dotenv_values(project / '.env')['MEMORY_BRIDGE_TOKEN'])
    with sqlite3.connect('file:' + originals.as_posix() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        watermark = db.execute('SELECT coalesce(max(seq),0) FROM evidence_events').fetchone()[0]
        rows = [dict(r) for r in db.execute("SELECT * FROM evidence_events WHERE eligible=1 AND seq<=? AND state!='erased' ORDER BY namespace,seq", (watermark,))]
    batches = []
    for row in rows:
        namespace = row['namespace']
        if namespace in TEST_NAMESPACES:continue
        if ledger.state(namespace)['pending']:
            raise RuntimeError('Finish pending deletion before migration')
        if ledger.source_blocked(namespace, [row['id'], *json.loads(row['related_ids_json'])]):
            continue
        # One immutable original per deterministic document; independent of the extraction window.
        batches.append(row)
    count = 0
    for row in batches:
        namespace = row['namespace']
        digest = hashlib.sha256(row['text'].encode('utf-8')).hexdigest()
        key = namespace + ':' + row['id']
        privacy = ledger.state(namespace)
        if state['completed'].get(key) == dict(sha256=digest, privacy_version=privacy['version']):
            continue
        metadata = {'message_id': row['platform_message_id'], 'scope': row['scope'], 'actor_id': row['actor_id'],
                    'evidence': {'privacy_version': privacy['version'], 'sources': [{'id': row['id'], 'role': row['role'], 'source_time': row['source_time'], 'state': row['state']}]}}
        with ledger.write_guard(namespace, privacy['version'], [row['id']]):
            adapter.retain(namespace, [{'role': row['role'], 'content': row['text']}],
                           session_id=row['session_id'] or 'evidence-migration', request_id='migrate:' + row['id'], meta=metadata)
        state['completed'][key] = dict(sha256=digest, privacy_version=privacy['version'])
        atomic(checkpoint, state)
        count += 1
        print(json.dumps({'migrated_this_run': count, 'eligible_total': len(batches)}), flush=True)
    # Preserve active legacy summaries inside Hindsight too, explicitly unverified.
    # Shadow/superseded rows stay in the immutable original-store snapshot.
    legacy_count=0
    for file in sorted((project/'data/hy-memory').rglob('chroma.sqlite3')):
        records=defaultdict(dict)
        with sqlite3.connect('file:'+file.as_posix()+'?mode=ro',uri=True) as db:
            for id,key,text,integer in db.execute('SELECT id,key,string_value,int_value FROM embedding_metadata'):
                records[id][key]=text if text is not None else integer
        for record in records.values():
            if record.get('status')!='active' or record.get('layer')!='l2_fact':continue
            custom=json.loads(record.get('custom') or '{}')
            if sources_from_meta({'custom':custom}):continue  # reconstructed from original roles above
            namespace=record.get('user_id');identifier=record.get('node_id')
            if namespace in TEST_NAMESPACES:continue
            if not identifier or record.get('agent_id')!='qqbot-hymemory':continue
            if ledger.memory_blocked(namespace,identifier) or ledger.state(namespace)['version']>0:continue
            content=record.get('content')
            if not isinstance(content,str) or not content.strip():continue
            legacy_count+=1;key=namespace+':legacy:'+identifier
            digest=hashlib.sha256(content.encode()).hexdigest();privacy=ledger.state(namespace)
            if state['completed'].get(key)==dict(sha256=digest,privacy_version=privacy['version']):continue
            with ledger.write_guard(namespace,privacy['version']):
                adapter.retain(namespace,[{'role':'assistant','content':'旧系统保存过的历史摘要，未找到原话，不能直接视为用户自述或现实事实：'+content}],
                               session_id='legacy-summary-migration',request_id='legacy:'+identifier,
                               meta={'legacy_summary':True,'verification':'unverified-no-original','legacy_memory_id':identifier})
            state['completed'][key]=dict(sha256=digest,privacy_version=privacy['version']);atomic(checkpoint,state)
    state.update(watermark=watermark, eligible_records=len(batches),legacy_summaries=legacy_count, partitions=len({r['namespace'] for r in batches}),
                 finished=datetime.now(timezone.utc).isoformat(), legacy_store_preserved=True,
                 legacy_without_originals='active summaries retained as unverified; shadow/superseded preserved offline; never promoted to originals')
    atomic(checkpoint, state)
    print(json.dumps({'migration_complete': True, 'watermark': watermark, 'records': len(batches), 'partitions': state['partitions']}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', required=True)
    migrate(parser.parse_args().project)
