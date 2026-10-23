"""Local desktop actions for the private reader; never print source text or IDs."""
from datetime import datetime
import json
from pathlib import Path
from reading_library import ReadingLibrary, CHINA, dumps


def library(project):
    return ReadingLibrary(Path(project) / 'data/reading-workspace')


def owner(project):
    settings = json.loads((Path(project) / 'data/companion/settings.json').read_text(encoding='utf-8-sig'))
    return ReadingLibrary.owner(settings.get('owner'))


def snapshot(project):
    store, key = library(project), owner(project)
    result = store.recall(key, limit=1)
    return {**result, 'path': str(store.root), 'inbox': str(store.root / 'inbox')}


def perform(project, action, payload):
    store, key = library(project), owner(project)
    if action == 'ReadingImport':
        covers = [1] if payload.get('coverReviewed') is True else []
        store.import_book(key, payload.get('file', ''), payload.get('title', ''), payload.get('author', ''), covers)
    elif action == 'ReadingNext':
        result = store.enqueue(key, str(payload.get('book', '')))
        return {**snapshot(project), 'request': result}
    elif action == 'ReadingAuto':
        store.set_auto(key, payload.get('enabled'))
    elif action == 'ReadingExport':
        destination = Path(project) / 'exports' / ('reading-notes-' + datetime.now(CHINA).strftime('%Y%m%d-%H%M%S-%f') + '.json')
        destination.parent.mkdir(parents=True, exist_ok=True)
        with store.db() as db:
            notes = [{**dict(n), 'payload': json.loads(n['payload']), 'hy_ids': json.loads(n['hy_ids'])}
                     for n in db.execute('SELECT id,book,seq,payload,created,index_status,hy_ids,shared_at FROM notes WHERE owner=? ORDER BY book,seq', (key,))]
        with destination.open('x', encoding='utf-8') as stream:
            stream.write(dumps({'format': 'yuzu-reading-notes-v1', 'books': store.status(key)['books'], 'notes': notes}))
        return {'path': str(destination), 'noteCount': len(notes), 'snapshot': snapshot(project)}
    elif action != 'ReadingStatus':
        raise ValueError('不支持的阅读操作。')
    return snapshot(project)
