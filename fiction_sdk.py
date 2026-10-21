"""Isolated public Hy Memory client for immutable, already reviewed fiction.

The SDK reads reconciliation switches at import time. A spawned process keeps
these settings and its database separate from real QQ user memory processing.
No extra network listener or credentials are introduced.
"""
import logging
import multiprocessing
import os
from pathlib import Path
import threading


def _serve(connection, directory):
    root = Path(directory).resolve()
    os.environ.update({
        'MEMORY_DATA_DIR': str(root),
        'MEMORY_PERSIST_DIR': str(root / 'vector_db'),
        'MEMORY_COLLECTION_NAME': 'qq_fiction_512',
        'RECONCILE_ENABLED': 'false',
        'MEMORY_SEARCH_DEDUP_ENABLED': 'false',
    })
    client = None
    try:
        from hy_memory import HyMemoryClient
        client = HyMemoryClient(mode='pro')
        logging.disable(logging.INFO)
        while True:
            operation, args, kwargs = connection.recv()
            if operation == 'close':
                break
            try:
                if operation not in {'add_extracted', 'get', 'search', 'delete_all'}:
                    raise ValueError('UnsupportedFictionOperation')
                connection.send((True, getattr(client, operation)(*args, **kwargs)))
            except Exception as error:
                connection.send((False, type(error).__name__))
    except (EOFError, BrokenPipeError):
        pass
    finally:
        if client is not None:
            client.close()
        connection.close()


class FictionSDK:
    def __init__(self, directory):
        self.directory = str(Path(directory).resolve())
        self.lock = threading.Lock()
        self.process = None
        self.connection = None

    def _close(self):
        if self.connection is not None:
            self.connection.close()
        if self.process is not None:
            if self.process.is_alive():
                self.process.terminate()
            self.process.join(timeout=5)
            self.process.close()
        self.process = self.connection = None

    def close(self):
        with self.lock:
            self._close()

    def call(self, operation, *args, **kwargs):
        with self.lock:
            try:
                if self.process is None or not self.process.is_alive():
                    self._close()
                    context = multiprocessing.get_context('spawn')
                    self.connection, child = context.Pipe()
                    self.process = context.Process(target=_serve, args=(child, self.directory), daemon=True)
                    self.process.start()
                    child.close()
                self.connection.send((operation, args, kwargs))
                if not self.connection.poll(120):
                    raise TimeoutError('FictionSDKTimeout')
                success, result = self.connection.recv()
                if not success:
                    raise RuntimeError('FictionSDKOperationFailed:' + result)
                return result
            except (EOFError, BrokenPipeError, OSError, TimeoutError):
                self._close()
                raise

    def add_extracted(self, *args, **kwargs):
        return self.call('add_extracted', *args, **kwargs)

    def get(self, *args, **kwargs):
        return self.call('get', *args, **kwargs)

    def search(self, *args, **kwargs):
        return self.call('search', *args, **kwargs)

    def delete_all(self, *args, **kwargs):
        return self.call('delete_all', *args, **kwargs)
