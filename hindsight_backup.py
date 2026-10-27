"""Consistent logical PostgreSQL snapshots; never copy a running cluster directory."""
import json
import os
from pathlib import Path
import subprocess
import socket
from urllib.parse import urlsplit, unquote


def pg_tools():
    roots=sorted((Path.home()/'.pg0/installation').glob('*/bin/pg_dump.exe'), reverse=True)
    if not roots:raise RuntimeError('Managed PostgreSQL backup tools unavailable')
    return roots[0].parent


def connection_env(project):
    project=Path(project).resolve()
    uri=json.loads((project/'hindsight/database.private.json').read_text(encoding='utf-8'))['uri']
    parsed=urlsplit(uri)
    if parsed.hostname not in ('127.0.0.1','localhost') or parsed.port!=55439:
        raise RuntimeError('Unexpected Hindsight database target')
    env=dict(os.environ,PGHOST='127.0.0.1',PGPORT=str(parsed.port),PGUSER=unquote(parsed.username),
             PGPASSWORD=unquote(parsed.password),PGDATABASE=unquote(parsed.path.lstrip('/')))
    return env


def dump(project, destination):
    project=Path(project).resolve()
    destination=Path(destination).absolute()
    if destination.exists():raise FileExistsError('Snapshot cannot overwrite existing files')
    env=connection_env(project)
    with socket.socket() as probe:
        probe.settimeout(.5)
        start_database=probe.connect_ex(('127.0.0.1',55439))!=0
    python=project/'hindsight/.venv/Scripts/python.exe'
    if start_database:
        # Backups also work while the bot is closed. Start only its existing DB,
        # without QQ, models, embeddings or the Hindsight HTTP service.
        code="import os; from pg0 import Pg0; Pg0(name='yuzu-hindsight',data_dir=os.environ['HINDSIGHT_DB_DATA'],port=55439,username=os.environ['PGUSER'],password=os.environ['PGPASSWORD'],database=os.environ['PGDATABASE'],config={'listen_addresses':'127.0.0.1'}).start()"
        env['HINDSIGHT_DB_DATA']=str(project/'hindsight/postgres')
        r=subprocess.run([str(python),'-c',code],env=env,capture_output=True)
        if r.returncode:raise RuntimeError('Managed database could not start for offline backup')
    destination.parent.mkdir(parents=True,exist_ok=True)
    temporary=destination.with_suffix('.partial')
    try:
        result=subprocess.run([str(pg_tools()/'pg_dump.exe'),'--format=custom','--no-owner','--no-acl','--file',str(temporary)],env=env,capture_output=True)
        if result.returncode:raise RuntimeError('Hindsight logical backup failed; partial archive is not recoverable')
    finally:
        if start_database:
            stopped=subprocess.run([str(python),'-c',"from pg0 import Pg0; Pg0(name='yuzu-hindsight').stop()"],capture_output=True)
            if stopped.returncode:raise RuntimeError('Managed offline-backup database did not stop')
    check=subprocess.run([str(pg_tools()/'pg_restore.exe'),'--list',str(temporary)],capture_output=True)
    if check.returncode or b'memory_units' not in check.stdout:
        raise RuntimeError('Hindsight backup directory validation failed')
    temporary.replace(destination)
    return dict(engine='hindsight',format='postgres-custom',directory_verified=True,contains_credentials=False)


def verify_restore(project, archive):
    """Restore into a new temporary database, count rows, then drop only that database."""
    import uuid
    name='yuzu_restore_'+uuid.uuid4().hex
    env=connection_env(project);tools=pg_tools()
    def run(tool,args,extra=None):
        r=subprocess.run([str(tools/tool),*args],env=extra or env,capture_output=True)
        if r.returncode:raise RuntimeError('Isolated PostgreSQL restore check failed at '+tool)
        return r.stdout
    run('createdb.exe',[name])
    try:
        run('pg_restore.exe',['--no-owner','--no-acl','--exit-on-error','--dbname',name,str(archive)])
        counts=run('psql.exe',['--dbname',name,'-At','-c','SELECT (SELECT count(*) FROM banks),(SELECT count(*) FROM documents),(SELECT count(*) FROM memory_units)'])
        banks,documents,memories=map(int,counts.strip().split(b'|'))
        return dict(restored=True,banks=banks,documents=documents,memories=memories,outbound_started=False)
    finally:
        run('dropdb.exe',['--force',name])
