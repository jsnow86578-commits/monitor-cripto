"""Cliente HTTP mínimo con reintentos, gzip y cortesía por host (solo stdlib)."""
from __future__ import annotations

import gzip
import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

USER_AGENT = "Mozilla/5.0 (compatible; MonitorCripto/1.0; panel personal XRP-ADA-ALGO)"

# Espaciado mínimo entre pedidos al mismo host (segundos)
HOST_SPACING = {
    # API pública de CoinGecko: ~5-15 pedidos/min según carga. Con clave Demo se puede bajar.
    "api.coingecko.com": 2.2 if os.environ.get("COINGECKO_API_KEY") else 6.0,
    "pro-api.coingecko.com": 0.5,
    "api.github.com": 0.4,
    "query1.finance.yahoo.com": 1.5,
    "api.coinmarketcap.com": 1.0,
    "api.koios.rest": 0.3,
}
DEFAULT_SPACING = 0.25

_last_hit: dict = {}
_lock = threading.Lock()


class HttpError(Exception):
    def __init__(self, message: str, status: int | None = None, url: str = ""):
        super().__init__(message)
        self.status = status
        self.url = url


def _ssl_context() -> ssl.SSLContext:
    cafile = os.environ.get("MC_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE")
    if cafile and os.path.exists(cafile):
        return ssl.create_default_context(cafile=cafile)
    return ssl.create_default_context()


_CTX = _ssl_context()


def _throttle(host: str) -> None:
    spacing = HOST_SPACING.get(host, DEFAULT_SPACING)
    with _lock:
        last = _last_hit.get(host, 0.0)
        wait = last + spacing - time.monotonic()
        _last_hit[host] = max(time.monotonic(), last + spacing)
    if wait > 0:
        time.sleep(wait)


def _decode(body: bytes, encoding: str | None) -> bytes:
    enc = (encoding or "").lower()
    if enc == "gzip" or body[:2] == b"\x1f\x8b":
        return gzip.decompress(body)
    if enc == "deflate":
        try:
            return zlib.decompress(body)
        except zlib.error:
            return zlib.decompress(body, -zlib.MAX_WBITS)
    return body


def request(url: str, *, method: str = "GET", data=None, headers: dict | None = None,
            timeout: float = 30.0, retries: int = 3, accept: str = "application/json") -> tuple:
    """Devuelve (status, headers, body_bytes). Reintenta en 429/5xx/errores de red."""
    host = urllib.parse.urlsplit(url).hostname or ""
    hdrs = {"User-Agent": USER_AGENT, "Accept": accept, "Accept-Encoding": "gzip"}
    if headers:
        hdrs.update(headers)
    payload = None
    if data is not None:
        payload = data if isinstance(data, (bytes, bytearray)) else json.dumps(data).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")

    attempt = 0
    while True:
        attempt += 1
        _throttle(host)
        req = urllib.request.Request(url, data=payload, headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as resp:
                body = _decode(resp.read(), resp.headers.get("Content-Encoding"))
                return resp.status, dict(resp.headers), body
        except urllib.error.HTTPError as e:
            status = e.code
            retry_after = e.headers.get("Retry-After") if e.headers else None
            if status in (429, 500, 502, 503, 504) and attempt <= retries:
                delay = _retry_delay(attempt, retry_after)
                time.sleep(delay)
                continue
            snippet = ""
            try:
                snippet = _decode(e.read(), e.headers.get("Content-Encoding"))[:180].decode("utf-8", "replace")
            except Exception:
                pass
            raise HttpError(f"HTTP {status} en {host}: {snippet.strip()[:120]}", status, url) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            if attempt <= retries:
                time.sleep(_retry_delay(attempt, None))
                continue
            raise HttpError(f"Error de red en {host}: {getattr(e, 'reason', e)}", None, url) from None


def _retry_delay(attempt: int, retry_after) -> float:
    if retry_after:
        try:
            return min(60.0, max(1.0, float(retry_after)))
        except ValueError:
            pass
    return min(45.0, 2.0 * (2 ** (attempt - 1)))


def get_json(url: str, **kw):
    status, headers, body = request(url, **kw)
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HttpError(f"Respuesta no JSON de {urllib.parse.urlsplit(url).hostname}: {e}", status, url)


def get_json_with_headers(url: str, **kw):
    status, headers, body = request(url, **kw)
    return json.loads(body.decode("utf-8")), headers


def get_text(url: str, accept: str = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
             **kw) -> str:
    status, headers, body = request(url, accept=accept, **kw)
    ctype = headers.get("Content-Type", "") or headers.get("content-type", "")
    charset = "utf-8"
    if "charset=" in ctype:
        charset = ctype.split("charset=")[-1].split(";")[0].strip() or "utf-8"
    try:
        return body.decode(charset, "replace")
    except LookupError:
        return body.decode("utf-8", "replace")


def post_json(url: str, payload: dict, **kw):
    return get_json(url, method="POST", data=payload, **kw)
