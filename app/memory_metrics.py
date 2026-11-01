"""Bounded numerical diagnostics. No prompts, identities or source IDs."""
import json
import math
import os
from pathlib import Path
import threading
from datetime import datetime, timezone

_lock=threading.Lock()
_fields={'elapsedMs','messageCount','sourceCount','inputCharacters','count','attempts','queueWaitMs'}

def record(stage, **values):
    if stage not in {'retain','retention_job','recall'} or os.environ.get('QQBOT_METRICS_ENABLED')=='false':return
    row={'at':datetime.now(timezone.utc).isoformat(),'stage':stage}
    row.update({k:v for k,v in values.items() if k in _fields and type(v) in (int,float) and math.isfinite(v) and v>=0})
    if values.get('status') in {'ok','error','blocked','retry','aborted'}:row['status']=values['status']
    try:
        directory=Path(os.environ.get('QQBOT_METRICS_DIR',str(Path(__file__).parent/'.run/performance')))
        with _lock:
            directory.mkdir(parents=True,exist_ok=True)
            file=directory/'memory-runtime.jsonl'
            if file.exists() and file.stat().st_size>2_000_000:file.replace(file.with_suffix('.jsonl.previous'))
            with file.open('a',encoding='utf-8') as stream:stream.write(json.dumps(row,separators=(',',':'))+'\n')
    except OSError:pass # Telemetry must never fail an otherwise valid operation.
