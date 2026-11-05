"""Bounded PDF text extraction. Input is bytes on stdin; never opens model paths."""
import io
import json
import logging
import sys

logging.disable(logging.CRITICAL)
MAX_BYTES = 32 * 1024 * 1024


def main():
    from pypdf import PdfReader
    start, count, max_chars = map(int, sys.argv[1:4])
    if not (1 <= start <= 100000 and 1 <= count <= 20 and 256 <= max_chars <= 50000):
        raise ValueError('PDF_ARGUMENTS_INVALID')
    raw = sys.stdin.buffer.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('PDF_TOO_LARGE')
    if not raw.startswith(b'%PDF-'):
        raise ValueError('PDF_INVALID')
    reader = PdfReader(io.BytesIO(raw), strict=False)
    if reader.is_encrypted and not reader.decrypt(''):
        raise ValueError('PDF_ENCRYPTED')
    total = len(reader.pages)
    if not 1 <= total <= 10000 or start > total:
        raise ValueError('PDF_PAGE_OUT_OF_RANGE')
    pages, used, truncated = [], 0, False
    for index in range(start - 1, min(total, start - 1 + count)):
        text = reader.pages[index].extract_text() or ''
        remaining = max_chars - used
        if len(text) > remaining:
            text, truncated = text[:remaining], True
        pages.append({'page': index + 1, 'text': text})
        used += len(text)
        if truncated or used >= max_chars:
            truncated = True
            break
    last = pages[-1]['page']
    print(json.dumps({'totalPages': total, 'pages': pages, 'truncated': truncated,
                      'hasMore': truncated or last < total,
                      'nextPage': last if truncated else last + 1 if last < total else None,
                      'textAvailable': any(p['text'].strip() for p in pages)}, ensure_ascii=True))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error)
        if not code.startswith('PDF_'):
            code = 'PDF_EXTRACTOR_UNAVAILABLE' if isinstance(error, ImportError) else 'PDF_INVALID'
        print(json.dumps({'error': code}))
        sys.exit(1)
