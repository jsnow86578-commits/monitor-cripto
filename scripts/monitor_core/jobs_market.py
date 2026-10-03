"""Tareas de mercado: precios, velas, Miedo y Codicia, historia."""
from __future__ import annotations

import os
import time
import urllib.parse

from . import http, store
from .config import (BENCHMARK, BINANCE_BASES, CANDLES_1D_LIMIT, CANDLES_4H_LIMIT, CG_BASE, CG_PRO_BASE,
                     CMC_DATA_API, COINS, FNG_URL, KEYS)


# --------------------------------------------------------------------------
# Helpers CoinGecko / Binance
# --------------------------------------------------------------------------
def _cg(path: str, params: dict | None = None):
    """GET a CoinGecko (usa clave Demo/Pro si existe en config.local.json o env)."""
    key = KEYS.get("COINGECKO_API_KEY")
    if key:
        http.HOST_SPACING["api.coingecko.com"] = 2.2
    pro = str(KEYS.get("COINGECKO_PRO", "")).lower() in ("1", "true", "yes", "si", "sí")
    base = CG_PRO_BASE if (key and pro) else CG_BASE
    headers = {}
    if key:
        headers["x-cg-pro-api-key" if pro else "x-cg-demo-api-key"] = key
    qs = ("?" + urllib.parse.urlencode(params)) if params else ""
    # En GitHub Actions las IP son compartidas: menos reintentos para no alargar la ejecución.
    retries = 2 if os.environ.get("GITHUB_ACTIONS") else 4
    return http.get_json(f"{base}{path}{qs}", headers=headers, retries=retries)


def _binance(path: str, params: dict):
    last_err = None
    qs = urllib.parse.urlencode(params)
    for base in BINANCE_BASES:
        try:
            return http.get_json(f"{base}{path}?{qs}", retries=2), base
        except http.HttpError as e:
            last_err = e
    raise last_err or http.HttpError("Binance no disponible")


def _norm_klines(rows) -> list:
    out = []
    for r in rows:
        try:
            out.append([int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])])
        except (TypeError, ValueError, IndexError):
            continue
    return out


def all_cg_ids() -> list:
    return [c["coingecko"] for c in COINS.values()] + [b["coingecko"] for b in BENCHMARK.values()]


def cg_to_key() -> dict:
    m = {c["coingecko"]: k for k, c in COINS.items()}
    m.update({b["coingecko"]: k for k, b in BENCHMARK.items()})
    return m


# --------------------------------------------------------------------------
# Tarea: precios (cada 1 h)
# --------------------------------------------------------------------------
def job_prices(tracker: store.SourceTracker) -> None:
    markets = _cg("/coins/markets", {
        "vs_currency": "usd",
        "ids": ",".join(all_cg_ids()),
        "sparkline": "true",
        "price_change_percentage": "1h,24h,7d,30d,1y",
        "precision": "full",
    })
    if not isinstance(markets, list) or not markets:
        raise http.HttpError("CoinGecko devolvió una lista vacía")
    tracker.ok("coingecko", "CoinGecko")

    crosscheck = {}
    try:
        symbols = [c["binance"] for c in COINS.values()]
        data, base = _binance("/api/v3/ticker/price", {"symbols": '["' + '","'.join(symbols) + '"]'})
        crosscheck["binance"] = {row["symbol"]: float(row["price"]) for row in data}
        tracker.ok("binance", "Binance")
    except Exception as e:  # el cruce es opcional
        tracker.fail("binance", e, "Binance")

    store.write("prices", store.envelope("coingecko", markets, vs="usd", crosscheck=crosscheck))


# --------------------------------------------------------------------------
# Tarea: velas 4h (cada 1 h) — base del motor de patrones
# --------------------------------------------------------------------------
def fetch_candles(interval: str, limit: int, tracker: store.SourceTracker) -> dict:
    out, source = {}, "binance"
    errors = []
    for key, coin in COINS.items():
        try:
            rows, base = _binance("/api/v3/klines", {"symbol": coin["binance"], "interval": interval,
                                                     "limit": limit})
            out[key] = _norm_klines(rows)
        except Exception as e:
            errors.append(f"{coin['binance']}: {e}")
    if errors and interval == "4h":
        # Respaldo: CoinGecko OHLC (30 días ⇒ velas de 4 h, sin volumen)
        source = "coingecko_ohlc"
        for key, coin in COINS.items():
            if key in out:
                continue
            try:
                rows = _cg(f"/coins/{coin['coingecko']}/ohlc", {"vs_currency": "usd", "days": 30})
                # CoinGecko marca el CIERRE de la vela: lo convertimos a apertura.
                out[key] = [[int(r[0]) - 4 * 3600 * 1000, float(r[1]), float(r[2]), float(r[3]),
                             float(r[4]), None] for r in rows]
                tracker.ok("coingecko", "CoinGecko")
            except Exception as e:
                errors.append(f"CG {coin['coingecko']}: {e}")
    if not out:
        raise http.HttpError("; ".join(errors) or "Sin velas")
    if errors:
        tracker.fail("binance", "; ".join(errors), "Binance")
    else:
        tracker.ok("binance", "Binance")
    return {"source": source, "payload": out}


def job_candles(tracker: store.SourceTracker) -> None:
    res = fetch_candles("4h", CANDLES_4H_LIMIT, tracker)
    store.write("candles4h", store.envelope(res["source"], res["payload"], interval="4h", format="ohlcv"))


# --------------------------------------------------------------------------
# Tarea: Miedo y Codicia (cada 3 h)
# --------------------------------------------------------------------------
def job_feargreed(tracker: store.SourceTracker) -> None:
    alt = http.get_json(FNG_URL)
    if not alt or not alt.get("data"):
        raise http.HttpError("Alternative.me sin datos")
    tracker.ok("alternative", "Alternative.me")
    env = store.envelope("alternative.me", alt)

    # Segundo índice para contrastar: CoinMarketCap (endpoint público del sitio, sin clave)
    try:
        end = int(time.time())
        start = end - 120 * 86400
        cmc = http.get_json(f"{CMC_DATA_API}/fear-greed/chart?start={start}&end={end}")
        rows = ((cmc or {}).get("data") or {}).get("dataList") or []
        env["cmc"] = {
            "fetched_at": store.now_iso(),
            "data": [{"score": r.get("score"), "name": r.get("name"), "timestamp": int(r.get("timestamp", 0))}
                     for r in rows if r.get("score") is not None],
        }
        tracker.ok("cmc_fng", "CoinMarketCap · Miedo y Codicia")
    except Exception as e:
        prev = store.read("feargreed") or {}
        if prev.get("cmc"):
            env["cmc"] = prev["cmc"]
            env["cmc"]["stale"] = True
        tracker.fail("cmc_fng", e, "CoinMarketCap · Miedo y Codicia")
    store.write("feargreed", env)


# --------------------------------------------------------------------------
# Tarea: historia (cada 6 h) — 1 año diario CoinGecko + velas 1D Binance
# --------------------------------------------------------------------------
def job_history(tracker: store.SourceTracker) -> None:
    mapping = cg_to_key()
    payload, errors = {}, []
    prev = (store.read("history") or {}).get("payload") or {}
    for cg_id in all_cg_ids():
        key = mapping[cg_id]
        try:
            d = _cg(f"/coins/{cg_id}/market_chart", {"vs_currency": "usd", "days": 365, "interval": "daily"})
            payload[key] = {
                "prices": [[int(t), float(v)] for t, v in d.get("prices", []) if v is not None],
                "total_volumes": [[int(t), float(v)] for t, v in d.get("total_volumes", []) if v is not None],
            }
        except Exception as e:
            errors.append(f"{cg_id}: {e}")
            if key in prev:
                payload[key] = prev[key]
    if not payload:
        raise http.HttpError("; ".join(errors))
    if errors:
        tracker.fail("coingecko_history", "; ".join(errors), "CoinGecko · historia")
    else:
        tracker.ok("coingecko_history", "CoinGecko · historia")
    store.write("history", store.envelope("coingecko", payload, interval="1d", partial=bool(errors)))

    try:
        res = fetch_candles("1d", CANDLES_1D_LIMIT, tracker)
        store.write("candles1d", store.envelope(res["source"], res["payload"], interval="1d", format="ohlcv"))
    except Exception as e:
        tracker.fail("binance_1d", e, "Binance · velas 1D")
