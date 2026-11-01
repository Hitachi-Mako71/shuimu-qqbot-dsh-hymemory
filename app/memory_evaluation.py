"""Read-only candidate preflight. Missing measurements never count as a win."""
from datetime import datetime,timezone
import importlib.util
import json
import math
from pathlib import Path
import platform
import shutil
import socket
import subprocess

GATES=('windows_lifecycle','isolation','update_delete','restore','source_expansion','model_contract','foreground_budget')

def number(value):return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value>=0

def decide(evidence):
    metrics=evidence.get('candidate_metrics')
    complete=bool(evidence.get('candidate_running')) and all(evidence.get('gates',{}).get(g) is True for g in GATES)
    complete=complete and isinstance(metrics,dict) and all(number(metrics.get(k)) for k in ('p95_ms','tokens','rss_mb'))
    complete=complete and number(evidence.get('quality_gain')) and evidence.get('same_source_same_model_same_budget') is True
    decision='evidence-insufficient'
    if complete:decision='candidate-qualified' if evidence['quality_gain']>0 and evidence.get('resource_budgets_passed') is True else 'keep-hy'
    return dict(decision=decision,migration_allowed=False,selected_production_path='keep-hy-unified-interface',candidate_metrics=metrics if evidence.get('candidate_running') else None,gates={g:evidence.get('gates',{}).get(g) for g in GATES},quality_gain=evidence.get('quality_gain'),reason='No automatic engine switch; missing operational or fair-comparison evidence is not a passing score')

def preflight(project=None):
    from urllib.request import build_opener,ProxyHandler
    project=Path(project or Path(__file__).resolve().parent)
    engine_file=project/'data/memory-engine.json'
    selected=json.loads(engine_file.read_text(encoding='utf-8')) if engine_file.exists() else {}
    running=False
    try:
        with build_opener(ProxyHandler({})).open('http://127.0.0.1:8889/health',timeout=3) as response:
            running=json.load(response).get('status')=='healthy'
    except Exception:pass
    decision=decide({'candidate_running':running})
    decision['selected_production_path']=selected.get('primary','not-configured')
    return dict(schema=2,milestone='2.3.0',checked_at_utc=datetime.now(timezone.utc).isoformat(),
        candidate=dict(name='Hindsight',evaluation_version='1.1.0',installation_source='https://hindsight.vectorize.io/developer/installation'),
        environment=dict(platform=platform.system(),isolated_python_installed=(project/'hindsight/.venv/Scripts/python.exe').exists(),native_windows_supported=True),
        candidate_running=running,user_directed_migration=selected.get('primary')=='hindsight',
        **decision,production_memory_read=False,production_memory_write=False,candidate_benchmarks_run=False,
        notes=['Read-only installation status; engine selection is never changed by this tool',
               'User-directed deployment is distinct from benchmark superiority; missing quality/usage comparisons remain unknown'])

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--report',type=Path,required=True);parser.add_argument('--project',type=Path);args=parser.parse_args()
    # Reports are public and contain capability booleans only, never local credentials or originals.
    args.report.write_text(json.dumps(preflight(args.project),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Memory installation status recorded; no engine switch or memory changes performed')
