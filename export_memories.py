"""Offline JSON export of current QQ facts from the pinned Hy Memory Chroma store."""
import argparse
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile

from dotenv import load_dotenv

AGENT = 'qqbot-hymemory'
CHINA = timezone(timedelta(hours=8))
TEST_NAMESPACES = {'qq-' + hashlib.sha256(label.encode()).hexdigest() for label in (
    'acceptance-user-A', 'acceptance-user-B', 'acceptance-group-G')}
TEST_NAMESPACES.add('qq-' + hashlib.sha256(json.dumps(
    ['acceptance-commands', 'c2c', 'isolated-test-user'], separators=(',', ':')).encode()).hexdigest())


def export(project, output, namespace=None, include_test_data=False):
    project, output = Path(project).resolve(), Path(output).resolve()
    if (project / '.run/services.json').exists():
        raise RuntimeError('Use export-memory.ps1: the managed services must be stopped before reading the database')
    if output.exists():
        raise FileExistsError('Refusing to overwrite an existing export')
    if namespace and not re.fullmatch(r'qq-[a-f0-9]{64}', namespace):
        raise ValueError('Invalid QQ namespace')
    load_dotenv(project / '.env', override=True)
    os.chdir(project)
    if os.environ.get('MEMORY_MODE', 'pro') not in ('pro', 'lite'):
        raise RuntimeError('This exporter supports the deployed pro/lite Chroma store; graph exports require a separate backup')
    from hy_memory.config import MemoryConfig
    from hy_memory.data.vector_store_chroma import ChromaVectorStore
    import chromadb
    from chromadb.config import Settings

    config = MemoryConfig.from_env()
    vector = config.vector_store
    if vector.provider != 'chroma' or vector.host:
        raise RuntimeError('This exporter only supports the deployed local Chroma backend')
    persist = Path(vector.persist_directory).resolve()
    if not (persist / 'chroma.sqlite3').is_file():
        raise FileNotFoundError('The configured Chroma database does not exist')
    name = vector.collection_name + (f'_{vector.embedding_dims}' if vector.embedding_dims else '')
    client = chromadb.PersistentClient(path=str(persist), settings=Settings(anonymized_telemetry=False))
    collection = client.get_collection(name=name)
    count = collection.count()
    payloads, seen = [], set()
    offset = 0
    while offset < count:
        page = collection.get(include=['metadatas'], limit=500, offset=offset)
        ids = page.get('ids', [])
        if not ids:
            raise RuntimeError('Unexpected empty page before the collection was fully read')
        for identifier, metadata in zip(ids, page['metadatas']):
            if identifier in seen:
                raise RuntimeError('Duplicate collection row while exporting')
            seen.add(identifier)
            payloads.append(ChromaVectorStore._chroma_metadata_to_payload(metadata or {}))
        offset += len(ids)
    if len(seen) != count or collection.count() != count:
        raise RuntimeError('The database changed during export; retry with the services stopped')

    owners = {row.get('user_id') for row in payloads if row.get('agent_id') == AGENT
              and re.fullmatch(r'qq-[a-f0-9]{64}', str(row.get('user_id', '')))}
    groups = defaultdict(list)
    skipped_test = 0
    for row in payloads:
        owner = row.get('user_id')
        if owner not in owners or (namespace and owner != namespace):
            continue
        if row.get('status') != 'active' or row.get('layer') == 'l1_raw':
            continue
        if row.get('agent_id') != AGENT and row.get('layer') != 'l0_basic_info':
            continue
        if owner in TEST_NAMESPACES and not include_test_data:
            skipped_test += 1
            continue
        # Keep provenance/metadata while omitting derived search text and vectors.
        row = {key: value for key, value in row.items() if key not in ('search_text', 'embedding')}
        groups[owner].append(row)
    partitions = []
    for owner, memories in sorted(groups.items()):
        memories.sort(key=lambda row: (row.get('gmt_created') or 0, row.get('node_id') or ''))
        partitions.append({'namespace': owner, 'test_data': owner in TEST_NAMESPACES,
                           'memory_count': len(memories), 'memories': memories})
    pending = {}
    outbox = project / 'data/outbox.sqlite3'
    if outbox.is_file():
        with closing(sqlite3.connect(outbox.as_uri() + '?mode=ro', uri=True)) as db:
            pending = dict(db.execute("SELECT status,COUNT(*) FROM jobs WHERE status IN ('pending','running') GROUP BY status"))
    result = {
        'format': 'qqbot-hymemory-active-facts', 'format_version': 1,
        'exported_at': datetime.now(CHINA).isoformat(),
        'hy_memory_version': importlib.metadata.version('hy-memory'),
        'memory_count': sum(item['memory_count'] for item in partitions),
        'partition_count': len(partitions), 'skipped_acceptance_memories': skipped_test,
        'pending_extraction_jobs': pending,
        'contains': 'Persisted ACTIVE facts and profiles, grouped by QQ identity namespace',
        'excludes': ['raw conversation layer', 'deleted/superseded facts', 'embeddings', 'credentials', 'personality prompt'],
        'partitions': partitions,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=output.parent,
                                         prefix='.memory-export-', suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write('\n')
        # Parse before publishing the complete file.
        published = json.loads(temporary.read_text(encoding='utf-8'))
        assert published['memory_count'] == sum(len(p['memories']) for p in published['partitions'])
        if output.exists():
            raise FileExistsError('An export with this name already exists')
        os.replace(temporary, output)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    print(json.dumps({'path': str(output), 'memory_count': result['memory_count'],
                      'partition_count': len(partitions), 'pending_extraction_jobs': pending}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', default=str(Path(__file__).resolve().parent))
    parser.add_argument('--output', required=True)
    parser.add_argument('--namespace')
    parser.add_argument('--include-test-data', action='store_true')
    args = parser.parse_args()
    export(args.project, args.output, args.namespace, args.include_test_data)
