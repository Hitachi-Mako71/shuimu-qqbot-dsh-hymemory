"""Keep Hy Memory's loopback model/embedding HTTP traffic local on Windows."""
from urllib.parse import urlsplit


def sdk_config():
    from hy_memory.config import MemoryConfig
    import httpx
    config = MemoryConfig.from_env()
    endpoints = (config.llm.base_url, config.embedder.base_url)
    if all(urlsplit(url or '').hostname in {'127.0.0.1', 'localhost', '::1'} for url in endpoints):
        # The SDK passes this transport to both its LLM and embedding clients.
        # An explicit transport avoids HTTPX's Windows system-proxy discovery.
        config.http_transport_factory = lambda: httpx.AsyncHTTPTransport(trust_env=False)
    return config
