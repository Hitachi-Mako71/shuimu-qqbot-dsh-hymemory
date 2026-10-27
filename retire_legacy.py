"""Stopped-service, repeatable archival of explicitly retired fiction features."""
import argparse
import hashlib
import json
from pathlib import Path
import os
import shutil
import stat

from memory_lifecycle import safe_path,atomic_json
from baseline_snapshot import protect

RETIRED=('data/reading-workspace','data/companion/journals','data/companion/worlds','data/companion/hy-memory')


def readonly_tree(project,root):
    for base,dirs,names in os.walk(root,followlinks=False):
        for name in dirs+names: safe_path(project,Path(base)/name)
        for name in names: (Path(base)/name).chmod(stat.S_IREAD)


def archive(project):
    project=Path(project).absolute()
    if (project/'.run/services.json').exists(): raise RuntimeError('Stop services before retiring data')
    destination=project/'.retired'
    safe_path(project,destination)
    destination.mkdir(exist_ok=True)
    protect(destination)
    moved=people=0
    for name in RETIRED:
        source=project/name;target=destination/name
        safe_path(project,source);safe_path(project,target)
        if source.exists():
            if target.exists(): raise RuntimeError('Retired archive already exists; refusing overwrite')
            for base,dirs,names in os.walk(source,followlinks=False):
                for part in dirs+names: safe_path(project,Path(base)/part)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.move(str(source),str(target));moved+=1
        if target.exists(): readonly_tree(project,target)
    source=project/'data/companion/people'
    if source.exists():
        for file in source.glob('*.json'):
            safe_path(project,file)
            original=file.read_bytes();data=json.loads(original.decode('utf-8-sig'))
            if not any(data.get(key) for key in ('life','moments','story')): continue
            digest=hashlib.sha256(original).hexdigest()
            target=destination/'people'/(file.stem+'.'+digest+'.json')
            safe_path(project,target);target.parent.mkdir(parents=True,exist_ok=True)
            if not target.exists():
                with target.open('xb') as stream: stream.write(original);stream.flush();os.fsync(stream.fileno())
            if target.read_bytes()!=original: raise RuntimeError('Retired state archive differs')
            target.chmod(stat.S_IREAD)
            for key in ('life','moments','story'): data.pop(key,None)
            atomic_json(file,data);people+=1
    return dict(moved_directories=moved,retired_person_states=people,archive_readonly=True,active_bindings_preserved=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--project',type=Path,required=True)
    args=parser.parse_args();print(json.dumps(archive(args.project)))
