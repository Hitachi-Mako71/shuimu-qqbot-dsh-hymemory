"""Apply the current authority to a verified, private, non-runnable restore."""
from memory_lifecycle import MemoryLifecycle, LocalHyDeletionAdapter, remove


def sanitize_restored_payload(payload, authority, adapter=None):
    lifecycle=MemoryLifecycle(payload,authority,dsh_home=payload/'_isolated-home',restored=True)
    operations=authority.operations()
    dump=payload/'hindsight/memories.dump'
    if operations and dump.exists():
        # An opaque old dump cannot be declared scrubbed. Keep the source backup
        # restricted, discard this isolated copy, rebuild from scrubbed evidence.
        remove(payload/'hindsight',dump)
    adapter=adapter or LocalHyDeletionAdapter(payload,persist=payload/'data/hy-memory/data/vector_db')
    for operation in operations:
        lifecycle.queue.cancel_sources(operation['namespace'],operation['plan']['source_ids'],erase=operation['mode']=='erase')
        lifecycle.cancel_legacy(operation)
        adapter.delete(operation)
        lifecycle.retire_caches(operation['namespace'])
        lifecycle.sanitize_exports(operation)
        if operation['mode']=='erase':
            lifecycle.erase_originals(operation)
            lifecycle.erase_workspace(operation)
            lifecycle.erase_image_tasks(operation)
            adapter.erase_auxiliary(operation)
            lifecycle.erase_logs()
            sessions=set(operation['plan']['session_ids'])
            key=operation['plan'].get('session_project_key')
            if key:
                if not key.endswith(operation['namespace']+'--'): raise ValueError('Invalid scoped session project')
                folder=payload/'dsh-sessions'/key
                if folder.exists(): sessions.update(p.name for p in folder.iterdir() if p.is_dir())
                remove(payload/'dsh-sessions',payload/'dsh-sessions'/key)
            for session in sessions:
                root=payload/'dsh-sessions'
                if root.exists():
                    for group in root.iterdir():
                        if group.is_dir(): remove(root,group/session)
                projections=payload/'dsh-projections'
                if projections.exists():
                    for file in projections.glob(session+'.json*'): remove(projections,file)
    # Keep the live ledger's operation status untouched: scrubbing an isolated
    # copy is not evidence that production cleanup succeeded.
    return dict(changed=True,operations_applied=len(operations),authority_id=authority.authority_id(),production_status_unchanged=True)
