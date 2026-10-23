"""Commit one native Codex image to its already authorized QQ job. No API calls."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import time


def complete(job_path, image_path=None, error=None):
    job_path = Path(job_path).resolve(strict=True)
    job = json.loads(job_path.read_text(encoding='utf-8-sig'))
    if (job_path.name != 'request.json' or not re.fullmatch(r'[a-f0-9-]{36}', job['id'])
            or job_path.parent.name != job['id'] or not re.fullmatch(r'[a-f0-9]{48}', job['nonce'])):
        raise ValueError('Invalid image request')
    if time.time() * 1000 > job['expiresAt']:
        raise ValueError('Image request expired; no delivery committed')
    ready = job_path.parent / 'ready.json'
    if ready.exists():
        raise ValueError('Image result already committed; no overwrite')
    result = {'id': job['id'], 'nonce': job['nonce']}
    if error:
        result['error'] = 'generation-unavailable'
    else:
        source = Path(image_path).resolve(strict=True)
        codex = Path(os.environ.get('CODEX_HOME', Path.home() / '.codex')).resolve()
        # Only native generated image artifacts are accepted, never arbitrary local files.
        native_roots = [(codex / 'generated_images').resolve(), (Path.home() / '.codex/generated_images').resolve()]
        if not any(source.is_relative_to(root) for root in native_roots):
            raise ValueError('Only native Codex generated images are accepted')
        size = source.stat().st_size
        if not 0 < size <= 30 * 1024 * 1024:
            raise ValueError('Unsupported image size')
        data = source.read_bytes()
        extension = ('png' if data.startswith(b'\x89PNG\r\n\x1a\n') else
                     'jpg' if data.startswith(b'\xff\xd8\xff') else
                     'webp' if data[:4] == b'RIFF' and data[8:12] == b'WEBP' else None)
        if not extension:
            raise ValueError('Unsupported image format')
        target = job_path.parent / ('image.' + extension)
        # Exclusive creation also rejects existing symlinks/hardlinks at the destination.
        with target.open('xb') as output:
            output.write(data)
        result.update(extension=extension, sha256=hashlib.sha256(data).hexdigest())
    temporary = ready.with_suffix('.tmp')
    with temporary.open('x', encoding='utf-8') as output:
        json.dump(result, output)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(ready)
    print('IMAGE_RESULT_COMMITTED ' + job['id'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job', required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--image')
    group.add_argument('--error')
    args = parser.parse_args()
    complete(args.job, args.image, args.error)
