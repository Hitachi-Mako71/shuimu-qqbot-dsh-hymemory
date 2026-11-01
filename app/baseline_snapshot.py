"""Private, stopped-service snapshots and network-free isolated recovery checks.

This module never starts QQ, loads credentials, runs agents or calls a model.
Manifests contain private paths/hashes and must stay with the private backup.
"""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import uuid

SCHEMA = 1
SKIP = {'node_modules', '__pycache__', '.git', '.plugin-manager'}


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): value.update(block)
    return value.hexdigest()


def write_json(path, value):
    temp = path.with_name(path.name + '.tmp')
    with temp.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def protect(path):
    """Restrict the directory before writing any private content."""
    if os.name == 'nt':
        identity = subprocess.check_output(['whoami', '/user', '/fo', 'csv', '/nh'], text=True)
        sid = next(csv.reader(io.StringIO(identity.strip())))[1]
        result = subprocess.run(['icacls.exe', str(path), '/inheritance:r', '/grant:r',
                                 f'*{sid}:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F'], capture_output=True)
        if result.returncode: raise RuntimeError('Private backup permissions could not be restricted')
    else:
        path.chmod(0o700)


def plain_file(path):
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
        raise ValueError('Linked or reparse-point snapshot input refused')
    return info


def files(root, exclude=()):
    if not root.exists(): return
    plain_file(root)
    for directory, dirs, names in os.walk(root, followlinks=False):
        base = Path(directory)
        dirs[:] = sorted(d for d in dirs if d not in SKIP and d not in exclude)
        for name in dirs: plain_file(base / name)
        for name in sorted(names):
            file = base / name
            plain_file(file)
            if file.is_file(): yield file


def source_files(repo):
    if not (repo / '.git').exists():
        for file in files(repo, ('data', 'exports', 'logs', 'runtime', '.run', '.privacy', '.retired', '.venv', 'hindsight', 'agent-work')):
            if file.name not in {'.env', 'qq.credentials.json', 'qq.credentials.verified'} and not file.name.endswith(('.bak', '.private.json', '.private.jsonl')):
                yield file
        return
    result = subprocess.run(['git', '-C', str(repo), 'ls-files', '--cached', '--others',
                             '--exclude-standard', '-z'], capture_output=True, check=True)
    for name in sorted(set(result.stdout.decode('utf-8').rstrip('\0').split('\0'))):
        if name and (repo / name).is_file():
            file = repo / name
            plain_file(file)
            if not file.resolve().is_relative_to(repo): raise ValueError('Source path escaped checkout')
            yield file


def selection(project, profile, repo, qq_state):
    roots = [('data', project / 'data', ('models',)),
             ('agent-work', project / 'agent-work', ()),
             ('profile', profile, ()), ('qq-state', qq_state, ()),
             ('exports', project / 'exports', ())]
    roots.append(('retired-data',project/'.retired',()))
    selected, coverage = {}, []
    for label, root, excluded in roots:
        found = list(files(root, excluded))
        coverage.append({'root': label, 'exists': root.exists(), 'files': len(found),
                         'excludedDirectoryNames': list(excluded) + sorted(SKIP)})
        for file in found: selected[f'{label}/{file.relative_to(root).as_posix()}'] = file
    for file in source_files(repo): selected['source/' + file.relative_to(repo).as_posix()] = file
    # Include actual deployed source and local configuration, including credentials.
    # Runtime dependencies/cache/logs/PIDs and retired source backups are excluded.
    for file in project.iterdir():
        if file.is_file() and (file.suffix in {'.py', '.ps1', '.md', '.json', '.yml', '.txt', '.ico'}
                               or file.name == '.env'):
            plain_file(file)
            selected['project/' + file.name] = file
    for name in ('dsh-hymemory-plugin',
                 'dependency-locks', 'patches', 'packages', 'tools'):
        for file in files(project / name):
            selected['project/' + file.relative_to(project).as_posix()] = file
    # Only the bot's evidence-linked DSH sessions are in scope. Never copy
    # unrelated Harness or Codex conversations.
    evidence=project/'data/evidence/qq-evidence.sqlite3'
    session_ids=set()
    if evidence.exists():
        session_ids=linked_session_ids(evidence)
    home=profile.parent.parent
    root=home/'sessions'
    if root.exists():
        for group in root.iterdir():
            plain_file(group)
            if not group.is_dir(): continue
            for session in session_ids:
                if not isinstance(session,str) or not all(c.isalnum() or c in '_-' for c in session): raise ValueError('Invalid linked DSH session')
                folder=group/session
                for file in files(folder): selected['dsh-sessions/'+file.relative_to(root).as_posix()]=file
    projections=home/'storages/session_projcache/sessions'
    for session in session_ids:
        if projections.exists():
            for file in projections.glob(session+'.json*'):
                plain_file(file);selected['dsh-projections/'+file.name]=file
    coverage.append(dict(root='linked-dsh-sessions',linked_sessions=len(session_ids),unrelated_sessions_excluded=True))
    for key in selected:
        parts = PurePosixPath(key).parts
        if '..' in parts or PurePosixPath(key).is_absolute(): raise ValueError('Unsafe snapshot member')
    return selected, coverage


def linked_session_ids(evidence):
    # Even mode=ro may create SHM/WAL alongside a WAL database. Inspect a
    # disposable family copy, as sqlite_statistics does, never mutate inputs.
    with tempfile.TemporaryDirectory(prefix='qq-session-discovery-') as temporary:
        scratch=Path(temporary)
        if scratch.resolve().parent!=Path(tempfile.gettempdir()).resolve():
            raise ValueError('Invalid session inspection scratch root')
        copy=scratch/'evidence.sqlite3'
        for suffix in ('','-wal','-shm'):
            source=Path(str(evidence)+suffix)
            if source.exists(): shutil.copyfile(source,Path(str(copy)+suffix))
        db=sqlite3.connect(copy.resolve().as_uri()+'?mode=ro',uri=True)
        try:
            return {row[0] for row in db.execute("SELECT DISTINCT session_id FROM evidence_events WHERE session_id IS NOT NULL")}
        finally: db.close()


def sqlite_statistics(root, records):
    # SQLite may refresh SHM even on a readonly connection. Inspect disposable
    # main/WAL/SHM copies so validation cannot change the archived byte hashes.
    scratch = Path(tempfile.mkdtemp(prefix='.sqlite-inspection-', dir=root))
    if not scratch.resolve().is_relative_to(root.resolve()): raise ValueError('Invalid inspection directory')
    try:
        return _sqlite_statistics(root, records, scratch)
    finally:
        shutil.rmtree(scratch)


def _sqlite_statistics(root, records, scratch):
    statistics = []
    for item in records:
        file = root / 'payload' / item['path']
        if file.suffix not in {'.sqlite', '.sqlite3', '.db'}: continue
        with file.open('rb') as stream:
            if stream.read(16) != b'SQLite format 3\0': continue
        # WAL and SHM are kept alongside the main file. Never use immutable=1,
        # which would ignore committed WAL content in a recovered database.
        inspected = scratch / 'database.sqlite3'
        for suffix in ('', '-wal', '-shm'):
            original = Path(str(file) + suffix)
            copied = Path(str(inspected) + suffix)
            if copied.exists(): copied.unlink()
            # Disposable inspection copies need writable attributes so Windows
            # can create WAL/SHM and remove them. Preserve archive bytes, not its
            # read-only flag; never change the original/archive permissions.
            if original.exists(): shutil.copyfile(original, copied)
        connection = sqlite3.connect(inspected.resolve().as_uri() + '?mode=ro', uri=True, timeout=10)
        try:
            connection.execute('PRAGMA query_only=ON')
            check = [r[0] for r in connection.execute('PRAGMA quick_check')]
            if check != ['ok']: raise ValueError('Snapshot SQLite integrity check failed')
            tables = {}
            for (name,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
                quoted = '"' + name.replace('"', '""') + '"'
                tables[name] = connection.execute(f'SELECT count(*) FROM {quoted}').fetchone()[0]
            schema = connection.execute('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').fetchall()
            statistics.append({'path': item['path'], 'quickCheck': 'ok', 'tables': tables,
                               'userVersion': connection.execute('PRAGMA user_version').fetchone()[0],
                               'schemaSha256': hashlib.sha256(json.dumps(schema).encode()).hexdigest()})
        finally:
            connection.close()
    return statistics


def require_stopped(project):
    if (project / '.run/services.json').exists():
        raise ValueError('Use baseline-snapshot.ps1 to stop managed services first')
    if os.name != 'nt': return
    command = ("$root=$env:YUZU_BASELINE_PROJECT; $found=@(Get-CimInstance Win32_Process -ErrorAction Stop | "
               "Where-Object {$_.CommandLine -and $_.CommandLine.Contains($root) -and "
               "($_.CommandLine.Contains('hymemory_service.py') -or "
               "($_.CommandLine.Contains('bin.js') -and $_.CommandLine.Contains('--profile qqbot')))}); "
               "if($found.Count){exit 4}")
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command],
                            env=dict(os.environ, YUZU_BASELINE_PROJECT=str(project)), capture_output=True)
    if result.returncode: raise ValueError('Stopped-service guard could not confirm a quiet project')


def capture(project, profile, repo, qq_state, destination):
    project, profile, repo, qq_state = [p.resolve() for p in (project, profile, repo, qq_state)]
    if profile.name != 'qqbot': raise ValueError('Only the dedicated qqbot profile is supported')
    require_stopped(project)
    from privacy_ledger import PrivacyLedger
    authority_file=project/'.privacy/lifecycle.sqlite3'
    if not authority_file.exists(): raise ValueError('Current deletion authority is required before backup')
    authority=PrivacyLedger(authority_file)
    if authority.operations(pending=True): raise ValueError('Finish privacy cleanup before creating a new backup')
    destination = destination.absolute()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists(): raise ValueError('Backup destination must be new')
    for root in (project / 'data', profile, repo, qq_state, project / 'exports'):
        # An installed project can also be its own source root. Its .run tree
        # is excluded from source selection, so the default destination is safe.
        excluded_run = root == repo == project and destination.resolve().is_relative_to(project / '.run')
        if destination.resolve().is_relative_to(root) and not excluded_run:
            raise ValueError('Backup destination overlaps an input root')
    destination.mkdir()
    protect(destination)
    selected, coverage = selection(project, profile, repo, qq_state)
    records = []
    for name, file in sorted(selected.items()):
        target = destination / 'payload' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        before = file.stat()
        checksum = digest(file)
        shutil.copy2(file, target)
        if digest(target) != checksum or file.stat().st_mtime_ns != before.st_mtime_ns:
            raise ValueError('Snapshot input changed while copying; incomplete backup is not recoverable')
        records.append({'path': name, 'bytes': before.st_size, 'sha256': checksum})
    # A new/deleted/changed file invalidates the entire claimed consistency point.
    final, _ = selection(project, profile, repo, qq_state)
    if set(final) != set(selected): raise ValueError('Snapshot membership changed during capture')
    for item in records:
        if digest(final[item['path']]) != item['sha256']: raise ValueError('Snapshot input changed before completion')
    require_stopped(project)
    head, dirty = None, None
    engine_file=project/'data/memory-engine.json'
    if engine_file.exists() and json.loads(engine_file.read_text(encoding='utf-8')).get('primary')=='hindsight':
        from hindsight_backup import dump
        name='hindsight/memories.dump'
        target=destination/'payload'/name
        coverage.append(dict(root='hindsight-logical',**dump(project,target)))
        records.append(dict(path=name,bytes=target.stat().st_size,sha256=digest(target)))
    if (repo / '.git').exists():
        head = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
        dirty = bool(subprocess.check_output(['git', '-C', str(repo), 'status', '--porcelain']))
    identity = hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()
    manifest = {'schema': SCHEMA, 'milestone': '1.0.0', 'createdAt': datetime.now(timezone.utc).isoformat(),
                'sourceBaseCommit': head, 'sourceCheckoutDirty': dirty, 'contentFingerprint': identity,
                'consistency': 'managed services stopped; source hashes rechecked after copy',
                'coverage': coverage, 'files': records,
                'limitations': ['No external Codex account/login or unrelated chats are copied.',
                    'DSH shared login is not copied; production recovery requires official sign-in.',
                    'Runtime dependencies and embedding model cache require pinned reinstall/download.',
                    'Original files never saved or already truncated cannot be reconstructed.',
                    'Archived reading/fiction data is retained offline, not enabled.',
                    'Do not start payload launchers or trust copied PIDs on an isolated restore.']}
    manifest['sqlite'] = sqlite_statistics(destination, records)
    manifest['privacy_authority_id']=authority.authority_id()
    manifest['privacy_authority_required']=True
    manifest['privacy_authority_in_payload']=False
    write_json(destination / 'manifest.private.json', manifest)
    # Completion marker is written last. Partial directories never qualify.
    write_json(destination / 'complete.private.json', {'schema': SCHEMA,
                'manifestSha256': digest(destination / 'manifest.private.json')})
    return summary(manifest, destination)


def load_verified(snapshot):
    snapshot = snapshot.resolve()
    plain_file(snapshot)
    marker = json.loads((snapshot / 'complete.private.json').read_text(encoding='utf-8'))
    if marker.get('schema') != SCHEMA or digest(snapshot / 'manifest.private.json') != marker['manifestSha256']:
        raise ValueError('Incomplete or changed backup manifest')
    manifest = json.loads((snapshot / 'manifest.private.json').read_text(encoding='utf-8'))
    if manifest.get('schema') != SCHEMA: raise ValueError('Unsupported snapshot schema')
    seen = set()
    for item in manifest['files']:
        name = item['path']
        parts = PurePosixPath(name).parts
        if name.casefold() in seen or '\\' in name or ':' in name or '..' in parts or name.startswith('/'):
            raise ValueError('Unsafe or duplicate snapshot member')
        seen.add(name.casefold())
        file = snapshot / 'payload' / name
        if not file.resolve().is_relative_to(snapshot / 'payload'): raise ValueError('Snapshot member escaped payload')
        plain_file(file)
        if file.stat().st_size != item['bytes'] or digest(file) != item['sha256']:
            raise ValueError('Backup member checksum mismatch')
    return manifest


def summary(manifest, snapshot):
    return {'path': str(snapshot), 'milestone': '1.0.0', 'schema': SCHEMA,
            'fileCount': len(manifest['files']), 'bytes': sum(i['bytes'] for i in manifest['files']),
            'sqliteCount': len(manifest['sqlite']), 'sourceBaseCommit': manifest['sourceBaseCommit'],
            'sourceCheckoutDirty': manifest['sourceCheckoutDirty'], 'contentFingerprint': manifest['contentFingerprint']}


def restore(snapshot, destination, privacy_ledger=None):
    manifest = load_verified(snapshot)
    if privacy_ledger is None or not Path(privacy_ledger).is_file():
        raise ValueError('An explicit current deletion authority is required; never use the backup as authority')
    from privacy_ledger import PrivacyLedger
    authority=PrivacyLedger(privacy_ledger)
    if manifest.get('privacy_authority_id') and manifest['privacy_authority_id']!=authority.authority_id():
        raise ValueError('Deletion authority does not match this backup')
    destination = destination.absolute()
    if destination.exists(): raise ValueError('Isolated restore destination must not exist')
    if destination.resolve().is_relative_to(snapshot.resolve()) or snapshot.resolve().is_relative_to(destination.resolve()):
        raise ValueError('Restore and snapshot must be separate')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.mkdir()
    protect(destination)
    for item in manifest['files']:
        target = destination / 'payload' / item['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(snapshot / 'payload' / item['path'], target)
        if digest(target) != item['sha256']: raise ValueError('Restored member mismatch')
    statistics = sqlite_statistics(destination, manifest['files'])
    if statistics != manifest['sqlite']: raise ValueError('Restored database counts differ')
    from restore_privacy import sanitize_restored_payload
    privacy=sanitize_restored_payload(destination/'payload',authority)
    write_json(destination / 'recovery.private.json', {**summary(manifest, destination),
               'allFileHashesMatch': not privacy['changed'], 'databaseCountsMatch': not privacy['changed'],
               'sourceFileHashesVerified':True,'sourceDatabaseCountsVerified':True,'deletionManifestApplied':True,
               'privacy':privacy,'outboundDisabled': True,
               'applicationBootVerified': False, 'qqAcceptanceVerified': False,
               'notice': 'Use only the isolated read-only inspection server; never run payload launchers.'})
    return json.loads((destination / 'recovery.private.json').read_text(encoding='utf-8'))


def serve(destination, ready_file):
    """Start an isolated readonly inspection endpoint, never a restored QQ bot."""
    report = json.loads((destination / 'recovery.private.json').read_text(encoding='utf-8'))
    public = {key: report[key] for key in ('milestone', 'schema', 'fileCount', 'sqliteCount',
              'allFileHashesMatch', 'databaseCountsMatch', 'sourceFileHashesVerified','sourceDatabaseCountsVerified',
              'deletionManifestApplied','outboundDisabled', 'applicationBootVerified')}
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != '/health': self.send_error(404); return
            payload = json.dumps({'ok': True, 'readOnly': True, **public}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        def log_message(self, *args): pass
    server = HTTPServer(('127.0.0.1', 0), Handler)
    write_json(ready_file, {'port': server.server_port, 'pid': os.getpid()})
    try: server.serve_forever()
    finally: server.server_close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['capture', 'verify', 'restore-isolated', 'serve-isolated'])
    for name in ('project', 'profile', 'repo', 'qq-state', 'destination', 'snapshot', 'ready-file', 'result','privacy-ledger'):
        parser.add_argument('--' + name, type=Path)
    args = parser.parse_args()
    try:
        if args.action == 'capture':
            result = capture(args.project, args.profile, args.repo, args.qq_state, args.destination)
        elif args.action == 'verify':
            result = summary(load_verified(args.snapshot), args.snapshot)
        elif args.action == 'restore-isolated': result = restore(args.snapshot, args.destination,args.privacy_ledger)
        else:
            serve(args.destination, args.ready_file)
            return
        if args.result: write_json(args.result, result)
        print(json.dumps(result))
    except Exception as error:
        # Private source paths and database contents never enter controller output.
        print(json.dumps({'success': False, 'errorClass': type(error).__name__,
                          'message': 'Baseline operation did not complete; existing data was not overwritten.'}))
        raise SystemExit(1)


if __name__ == '__main__': main()
