"""Tarea de fundamentales (cada 6 h).

Fuentes: CoinGecko (perfil), CoinMarketCap, Messari, Glassnode (opcional), DefiLlama,
GitHub, redes (XRPL/XRPScan, Koios, Algorand Foundation), Yahoo Finance y Cryptodaily.
Cada bloque guarda su fecha; si una fuente falla se conserva el último dato válido
marcado como "stale".
"""
from __future__ import annotations

import re
import time
import urllib.parse

from . import http, news, store
from .config import (ALGO_METRICS, ALGO_SUPPLY, ALGOD, CMC_DATA_API, CMC_PRO_API, COINS, GITHUB_API, KEYS,
                     KOIOS, LLAMA, LLAMA_STABLES, MEDIA_FEEDS, MESSARI_ASSETS, XRPL_RPC, XRPSCAN, YAHOO_CHART,
                     YAHOO_NEWS_QUERIES, YAHOO_SEARCH)
from .jobs_market import _cg

DAY = 86400


def _f(x):
    try:
        return None if x is None else float(x)
    except (TypeError, ValueError):
        return None


def _pct(new, old):
    if new is None or old in (None, 0):
        return None
    return (new - old) / old * 100.0


def _value_days_ago(series, days, key=1):
    """series: [[ts_s, valor], ...] ordenado. Devuelve el valor de hace N días."""
    if not series:
        return None
    target = series[-1][0] - days * DAY
    best = None
    for row in series:
        if row[0] <= target:
            best = row[key]
        else:
            break
    return best


def _block(data: dict, source: str) -> dict:
    data = dict(data)
    data["updated_at"] = store.now_iso()
    data["source"] = source
    return data


# --------------------------------------------------------------------------
# CoinGecko — perfil y datos de mercado extendidos
# --------------------------------------------------------------------------
def _first_sentences(text: str, n: int = 2, limit: int = 420) -> str:
    text = news.clean_text(text)
    parts = re.split(r"(?<=[.!?])\s+", text)
    return news.clean_text(" ".join(parts[:n]), limit)


def fetch_cg_profile(coin: dict) -> dict:
    d = _cg(f"/coins/{coin['coingecko']}", {"localization": "false", "tickers": "false", "market_data": "true",
                                            "community_data": "false", "developer_data": "false",
                                            "sparkline": "false"})
    md = d.get("market_data") or {}
    links = d.get("links") or {}
    usd = lambda k: (md.get(k) or {}).get("usd") if isinstance(md.get(k), dict) else md.get(k)
    return {
        "categories": [c for c in (d.get("categories") or []) if c][:12],
        "description": _first_sentences((d.get("description") or {}).get("en", "")),
        "genesis_date": d.get("genesis_date"),
        "homepage": [u for u in (links.get("homepage") or []) if u][:3],
        "explorers": [u for u in (links.get("blockchain_site") or []) if u][:5],
        "repos": [u for u in ((links.get("repos_url") or {}).get("github") or []) if u][:6],
        "twitter": links.get("twitter_screen_name"),
        "reddit": links.get("subreddit_url"),
        "sentiment_up_pct": _f(d.get("sentiment_votes_up_percentage")),
        "watchlist_users": d.get("watchlist_portfolio_users"),
        "market_cap_rank": d.get("market_cap_rank"),
        "market": {
            "ath": _f(usd("ath")), "ath_date": (md.get("ath_date") or {}).get("usd"),
            "ath_change_pct": _f((md.get("ath_change_percentage") or {}).get("usd")),
            "atl": _f(usd("atl")), "atl_date": (md.get("atl_date") or {}).get("usd"),
            "circulating_supply": _f(md.get("circulating_supply")),
            "total_supply": _f(md.get("total_supply")),
            "max_supply": _f(md.get("max_supply")),
            "fdv": _f(usd("fully_diluted_valuation")),
            "mcap_fdv_ratio": _f(md.get("market_cap_fdv_ratio")),
            "change_14d": _f(md.get("price_change_percentage_14d")),
            "change_60d": _f(md.get("price_change_percentage_60d")),
            "change_200d": _f(md.get("price_change_percentage_200d")),
            "change_1y": _f(md.get("price_change_percentage_1y")),
        },
    }


# --------------------------------------------------------------------------
# CoinMarketCap
# --------------------------------------------------------------------------
def fetch_cmc(coin: dict) -> dict:
    key = KEYS.get("CMC_API_KEY")
    if key:
        d = http.get_json(f"{CMC_PRO_API}/v2/cryptocurrency/quotes/latest?id={coin['cmc_id']}",
                          headers={"X-CMC_PRO_API_KEY": key})
        q = d["data"][str(coin["cmc_id"])]
        usd = q["quote"]["USD"]
        return {
            "mode": "api_key",
            "rank": q.get("cmc_rank"),
            "dominance_pct": _f(usd.get("market_cap_dominance")),
            "turnover": (_f(usd.get("volume_24h")) or 0) / (_f(usd.get("market_cap")) or 1),
            "tags": [(t.get("name") if isinstance(t, dict) else str(t)) for t in (q.get("tags") or [])][:8],
            "date_added": q.get("date_added"),
            "url": f"https://coinmarketcap.com/currencies/{coin['cmc_slug']}/",
        }
    d = http.get_json(f"{CMC_DATA_API}/cryptocurrency/detail?id={coin['cmc_id']}")
    c = d.get("data") or {}
    st = c.get("statistics") or {}
    audits = [{"auditor": a.get("auditor"), "date": (a.get("auditTime") or "")[:10]}
              for a in (c.get("auditInfos") or []) if a.get("auditStatus") == 2]
    try:
        watch = int(c.get("watchCount")) if c.get("watchCount") is not None else None
    except (TypeError, ValueError):
        watch = None
    return {
        "mode": "public",
        "rank": st.get("rank"),
        "watchlists": watch,
        "watchlist_rank": c.get("watchListRanking"),
        "dominance_pct": _f(st.get("marketCapDominance")),
        "turnover": _f(st.get("turnover")),
        "volume_rank": st.get("volumeRank"),
        "cex_volume": _f(c.get("cexVolume")),
        "dex_volume": _f(c.get("dexVolume")),
        "high_52w": _f(st.get("high52w")), "low_52w": _f(st.get("low52w")),
        "ytd_change_pct": _f(st.get("ytdPriceChangePercentage")),
        "change_90d": _f(st.get("priceChangePercentage90d")),
        "tags": [t.get("name") for t in (c.get("tags") or []) if t.get("category") in ("INDUSTRY", "CATEGORY",
                                                                                         "ALGORITHM")][:8],
        "audits": audits[:3],
        "date_added": (c.get("dateAdded") or "")[:10],
        "url": f"https://coinmarketcap.com/currencies/{coin['cmc_slug']}/",
    }


# --------------------------------------------------------------------------
# Messari (taxonomía pública; métricas avanzadas requieren clave)
# --------------------------------------------------------------------------
def fetch_messari_taxonomy() -> dict:
    headers = {}
    if KEYS.get("MESSARI_API_KEY"):
        headers["x-messari-api-key"] = KEYS["MESSARI_API_KEY"]
    d = http.get_json(f"{MESSARI_ASSETS}?limit=1000", headers=headers, timeout=45)
    wanted = {c["messari"]: k for k, c in COINS.items()}
    out = {}
    for a in d.get("data") or []:
        slug = a.get("slug")
        if slug in wanted:
            out[wanted[slug]] = {
                "rank": a.get("rank"),
                "category": a.get("category"),
                "sector": a.get("sector"),
                "sectors": a.get("sectorV2") or [],
                "subsectors": a.get("subSectorV2") or [],
                "tags": a.get("tags") or [],
                "has_research": a.get("hasResearch"),
                "url": f"https://messari.io/project/{slug}",
            }
    return out


# --------------------------------------------------------------------------
# Glassnode (solo con clave)
# --------------------------------------------------------------------------
GLASSNODE_METRICS = [("addresses/active_count", "active_addresses"), ("transactions/count", "tx_count")]


def fetch_glassnode(coin: dict) -> dict:
    key = KEYS["GLASSNODE_API_KEY"]
    out = {}
    since = int(time.time()) - 40 * DAY
    for path, name in GLASSNODE_METRICS:
        url = (f"https://api.glassnode.com/v1/metrics/{path}?a={coin['symbol']}&i=24h&s={since}"
               f"&api_key={urllib.parse.quote(key)}")
        try:
            rows = http.get_json(url, retries=1)
            if rows:
                out[name] = {"last": rows[-1].get("v"), "series": [[r["t"], r["v"]] for r in rows[-30:]]}
        except http.HttpError as e:
            out[name] = {"error": str(e)[:120]}
    return out


# --------------------------------------------------------------------------
# DefiLlama — adopción DeFi por red
# --------------------------------------------------------------------------
def fetch_defillama() -> dict:
    chains = http.get_json(f"{LLAMA}/v2/chains")
    tvl_now = {c["name"]: _f(c.get("tvl")) for c in chains if c.get("name")}
    stables_now = {}
    try:
        for c in http.get_json(f"{LLAMA_STABLES}/stablecoinchains"):
            stables_now[c.get("name")] = _f((c.get("totalCirculatingUSD") or {}).get("peggedUSD"))
    except http.HttpError:
        pass
    out = {}
    for key, coin in COINS.items():
        chain = coin["llama_chain"]
        block = {"chain": chain, "tvl": tvl_now.get(chain), "stablecoins": stables_now.get(coin["llama_stable_chain"]),
                 "url": f"https://defillama.com/chain/{urllib.parse.quote(chain)}"}
        try:
            hist = http.get_json(f"{LLAMA}/v2/historicalChainTvl/{urllib.parse.quote(chain)}")
            series = [[int(r["date"]), _f(r["tvl"])] for r in hist if r.get("tvl") is not None]
            if series:
                last = series[-1][1]
                block["tvl_change_7d"] = _pct(last, _value_days_ago(series, 7))
                block["tvl_change_30d"] = _pct(last, _value_days_ago(series, 30))
                block["tvl_series"] = [[t, round(v)] for t, v in series[-180:]]
        except http.HttpError as e:
            block["tvl_error"] = str(e)[:120]
        try:
            sc = http.get_json(f"{LLAMA_STABLES}/stablecoincharts/{urllib.parse.quote(coin['llama_stable_chain'])}")
            s_series = []
            for r in sc:
                v = _f(((r.get("totalCirculatingUSD") or {}).get("peggedUSD")))
                if v is not None:
                    s_series.append([int(r["date"]), v])
            if s_series:
                block["stablecoins_change_30d"] = _pct(s_series[-1][1], _value_days_ago(s_series, 30))
                block["stablecoins_series"] = [[t, round(v)] for t, v in s_series[-180:]]
                block["stablecoins"] = block.get("stablecoins") or s_series[-1][1]
        except (http.HttpError, KeyError, TypeError):
            pass
        for kind in ("dexs", "fees"):
            try:
                d = http.get_json(f"{LLAMA}/overview/{kind}/{urllib.parse.quote(chain)}"
                                  "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true")
                entry = {k: _f(d.get(k)) for k in ("total24h", "total7d", "total30d", "change_1d", "change_7d",
                                                   "change_1m")}
                if kind == "dexs":
                    prots = sorted(d.get("protocols") or [], key=lambda p: -(_f(p.get("total24h")) or 0))
                    entry["top"] = [{"name": p.get("displayName") or p.get("name"), "vol24h": _f(p.get("total24h"))}
                                    for p in prots[:4] if (_f(p.get("total24h")) or 0) > 0]
                block[kind] = entry
            except http.HttpError as e:
                block[f"{kind}_error"] = str(e)[:120]
        out[key] = block
    return out


# --------------------------------------------------------------------------
# GitHub — actividad de desarrollo
# --------------------------------------------------------------------------
def _gh(path: str):
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if KEYS.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {KEYS['GITHUB_TOKEN']}"
    status, hdrs, body = http.request(f"{GITHUB_API}{path}", headers=headers, retries=1)
    import json as _json
    return status, (_json.loads(body.decode("utf-8")) if body else None)


def fetch_repo(repo: str) -> dict:
    status, info = _gh(f"/repos/{repo}")
    out = {"repo": repo, "url": f"https://github.com/{repo}", "stars": info.get("stargazers_count"),
           "forks": info.get("forks_count"), "open_issues": info.get("open_issues_count"),
           "pushed_at": info.get("pushed_at"), "description": news.clean_text(info.get("description"), 140)}
    weeks = None
    for attempt in range(5):  # /stats puede responder 202 mientras GitHub calcula
        st, data = _gh(f"/repos/{repo}/stats/commit_activity")
        if st == 200 and isinstance(data, list):
            weeks = data
            break
        time.sleep(2.0 + attempt * 1.5)
    if weeks:
        series = [int(w.get("total", 0)) for w in weeks]
        out["weekly_commits"] = series[-52:]
        out["commits_4w"] = sum(series[-4:])
        out["commits_12w"] = sum(series[-12:])
        out["commits_52w"] = sum(series[-52:])
    try:
        st, rel = _gh(f"/repos/{repo}/releases/latest")
        if st == 200 and rel:
            out["release"] = {"tag": rel.get("tag_name"), "name": news.clean_text(rel.get("name"), 80),
                              "date": rel.get("published_at"), "url": rel.get("html_url")}
    except http.HttpError:
        try:
            st, tags = _gh(f"/repos/{repo}/tags?per_page=1")
            if tags:
                out["release"] = {"tag": tags[0].get("name"), "name": tags[0].get("name"), "date": None,
                                  "url": f"https://github.com/{repo}/tags"}
        except http.HttpError:
            pass
    return out


def fetch_dev(coin: dict, prev: dict | None) -> dict:
    repos, errors = [], []
    prev_repos = {r.get("repo"): r for r in ((prev or {}).get("repos") or [])}
    for repo in coin["repos"]:
        try:
            r = fetch_repo(repo)
            old = prev_repos.get(repo) or {}
            if "weekly_commits" not in r and old.get("weekly_commits"):
                # GitHub todavía está calculando las estadísticas (HTTP 202): usar las anteriores.
                for k in ("weekly_commits", "commits_4w", "commits_12w", "commits_52w"):
                    r[k] = old.get(k)
                r["stats_stale"] = True
            repos.append(r)
        except http.HttpError as e:
            errors.append(f"{repo}: {e}")
            if repo in prev_repos:
                r = dict(prev_repos[repo])
                r["stale"] = True
                repos.append(r)
    if not repos:
        raise http.HttpError("; ".join(errors) or "sin repos")
    weekly = [0] * 52
    for r in repos:
        w = r.get("weekly_commits") or []
        for i, v in enumerate(w[-52:]):
            weekly[52 - len(w[-52:]) + i] += v
    releases = [dict(r["release"], repo=r["repo"]) for r in repos if r.get("release") and r["release"].get("date")]
    releases.sort(key=lambda x: x["date"], reverse=True)
    return {
        "repos": repos,
        "weekly_commits": weekly,
        "commits_4w": sum(weekly[-4:]),
        "commits_12w": sum(weekly[-12:]),
        "commits_52w": sum(weekly),
        "commits_prev_12w": sum(weekly[-24:-12]),
        "stars": sum(r.get("stars") or 0 for r in repos),
        "latest_release": releases[0] if releases else None,
        "errors": errors[:4],
    }


# --------------------------------------------------------------------------
# Redes: XRPL, Cardano, Algorand
# --------------------------------------------------------------------------
def fetch_network_xrp() -> dict:
    info = None
    for url in XRPL_RPC:
        try:
            info = http.post_json(url, {"method": "server_info", "params": [{}]})["result"]["info"]
            break
        except Exception:
            continue
    out = {"chain": "XRP Ledger", "explorer": "https://xrpscan.com/"}
    if info:
        vl = info.get("validated_ledger") or {}
        out.update({
            "ledger": vl.get("seq"), "base_fee_xrp": _f(vl.get("base_fee_xrp")),
            "reserve_base_xrp": _f(vl.get("reserve_base_xrp")), "reserve_inc_xrp": _f(vl.get("reserve_inc_xrp")),
            "load_factor": _f(info.get("load_factor")),
            "proposers": (info.get("last_close") or {}).get("proposers"),
            "converge_s": _f((info.get("last_close") or {}).get("converge_time_s")),
            "server_version": info.get("build_version"),
        })
    try:
        led = http.get_json(f"{XRPSCAN}/ledger")
        L = led.get("ledgers") or []
        if len(L) >= 2:
            span = L[0]["close_time"] - L[-1]["close_time"]
            txs = sum(l.get("tx_count", 0) for l in L[:-1])
            out["tps_now"] = round(txs / span, 1) if span > 0 else None
            out["total_coins"] = _f(L[0].get("total_coins"))
            if out["total_coins"]:
                out["burned_total_xrp"] = 100_000_000_000 - out["total_coins"] / 1e6
        if not out.get("ledger"):
            out["ledger"] = led.get("current_ledger")
    except Exception as e:
        out["xrpscan_ledger_error"] = str(e)[:120]
    try:
        m = http.get_json(f"{XRPSCAN}/metrics/metric", timeout=60)
        days = [r for r in m if r.get("metric")][-92:]
        complete = days[:-1] if len(days) > 1 else days    # el último día está en curso
        last = complete[-1]["metric"] if complete else {}
        avg = lambda k, n: (sum((d["metric"].get(k) or 0) for d in complete[-n:]) / max(1, len(complete[-n:])))
        out["daily"] = {
            "date": complete[-1]["date"][:10] if complete else None,
            "transactions": last.get("transaction_count"),
            "payments": last.get("payments_count"),
            "accounts_created": last.get("accounts_created"),
            "active_accounts": last.get("active_accounts"),
            "active_users": last.get("active_users"),
            "fee_burned_xrp": _f(last.get("fee_total")),
            "ledger_interval_s": _f(last.get("ledger_interval")),
            "tx_avg_30d": round(avg("transaction_count", 30)),
            "active_avg_30d": round(avg("active_accounts", 30)),
            "tx_prev_avg_30d": round(sum((d["metric"].get("transaction_count") or 0) for d in complete[-60:-30])
                                     / max(1, len(complete[-60:-30]))),
        }
        out["series_tx"] = [[d["date"][:10], d["metric"].get("transaction_count")] for d in complete[-90:]]
        out["series_active"] = [[d["date"][:10], d["metric"].get("active_accounts")] for d in complete[-90:]]
    except Exception as e:
        out["xrpscan_metrics_error"] = str(e)[:120]
    try:
        amm = http.get_json(f"{XRPSCAN}/metrics/amm", timeout=40)
        if amm:
            last = amm[-1].get("amm") or {}
            out["amm_pools"] = last.get("amm_count")
            out["amm_xrp_locked"] = _f(last.get("xrp_locked"))
    except Exception:
        pass
    if not info and "daily" not in out:
        raise http.HttpError("XRPL sin respuesta")
    return out


def _koios(path: str, headers=None):
    return http.get_json(f"{KOIOS}{path}", headers=headers or {}, timeout=40)


def _koios_count(path: str) -> int | None:
    _, hdrs, _ = http.request(f"{KOIOS}{path}", headers={"Prefer": "count=exact"}, timeout=40)
    cr = hdrs.get("Content-Range") or hdrs.get("content-range") or ""
    try:
        return int(cr.split("/")[-1])
    except ValueError:
        return None


def fetch_network_ada() -> dict:
    tip = _koios("/tip")[0]
    epoch = tip["epoch_no"]
    out = {"chain": "Cardano", "explorer": "https://cardanoscan.io/", "epoch": epoch,
           "block_height": tip.get("block_height") or tip.get("block_no"), "block_time": tip.get("block_time")}
    epochs = _koios("/epoch_info?order=epoch_no.desc&limit=19&select=epoch_no,tx_count,blk_count,active_stake,"
                    "fees,start_time,end_time")
    complete = [e for e in epochs if e["epoch_no"] < epoch]
    cur = next((e for e in epochs if e["epoch_no"] == epoch), None)
    if complete:
        last = complete[0]
        out["last_epoch"] = {"epoch": last["epoch_no"], "tx_count": last.get("tx_count"),
                             "blocks": last.get("blk_count"), "fees_ada": (_f(last.get("fees")) or 0) / 1e6}
        out["series_tx_epoch"] = [[e["epoch_no"], e.get("tx_count")] for e in reversed(complete)]
        prev = complete[1:4]
        if prev:
            out["tx_epoch_avg_prev3"] = sum(e.get("tx_count") or 0 for e in prev) / len(prev)
    if cur:
        out["epoch_progress"] = None
        if cur.get("start_time") and cur.get("end_time"):
            span = cur["end_time"] - cur["start_time"]
            out["epoch_progress"] = round(min(1.0, max(0.0, (time.time() - cur["start_time"]) / span)), 3)
            out["epoch_ends"] = cur["end_time"]
    active = _f((cur or (complete[0] if complete else {})).get("active_stake"))
    try:
        tot = _koios(f"/totals?_epoch_no={epoch}")[0]
        circ = _f(tot.get("circulation"))
        out.update({"circulation_ada": circ / 1e6 if circ else None,
                    "treasury_ada": (_f(tot.get("treasury")) or 0) / 1e6,
                    "reserves_ada": (_f(tot.get("reserves")) or 0) / 1e6})
        if active and circ:
            out["active_stake_ada"] = active / 1e6
            out["stake_ratio"] = active / circ
    except Exception as e:
        out["totals_error"] = str(e)[:100]
    try:
        out["pools"] = _koios_count("/pool_list?select=pool_id_bech32&pool_status=eq.registered&limit=1")
    except Exception:
        pass
    try:
        out["dreps"] = _koios_count("/drep_list?select=drep_id&registered=eq.true&limit=1")
    except Exception:
        pass
    try:
        props = _koios("/proposal_list?select=proposal_type,proposed_epoch,expiration,ratified_epoch,enacted_epoch,"
                       "dropped_epoch,expired_epoch&limit=1000")
        active_p = [p for p in props if not any(p.get(k) for k in ("ratified_epoch", "enacted_epoch",
                                                                     "dropped_epoch", "expired_epoch"))]
        types = {}
        for p in active_p:
            types[p.get("proposal_type")] = types.get(p.get("proposal_type"), 0) + 1
        out["governance"] = {"active_proposals": len(active_p), "types": types, "total_proposals": len(props),
                             "url": "https://gov.tools/"}
    except Exception as e:
        out["governance_error"] = str(e)[:100]
    return out


def fetch_network_algo() -> dict:
    out = {"chain": "Algorand", "explorer": "https://allo.info/", "official_metrics": "https://algorand.co/metrics"}
    got = 0
    try:
        h = http.get_json(f"{ALGO_METRICS}/realtime/health")
        out.update({"round": h.get("as_of_round"), "status": h.get("status"), "forks": h.get("forks"),
                    "downtime_365d_s": h.get("downtime_365days"), "uptime_s": h.get("uptime_sec"),
                    "upgrade": h.get("upgrade")})
        got += 1
    except Exception as e:
        out["health_error"] = str(e)[:100]
    try:
        bt = http.get_json(f"{ALGO_METRICS}/realtime/blocks/time")
        by = {str(r.get("last_blocks")): r for r in bt}
        r1k = by.get("1000") or (bt[1] if len(bt) > 1 else bt[0])
        r100k = by.get("100000") or bt[-1]
        out.update({"block_time_s": _f(r1k.get("block_time")), "tps_now": _f(r1k.get("tps")),
                    "tps_100k": _f(r100k.get("tps"))})
        got += 1
    except Exception as e:
        out["blocks_error"] = str(e)[:100]
    for path, key in (("/delayed/accounts/active/24", "active"), ("/delayed/accounts/open", "open"),
                      ("/realtime/participation/online", "online"), ("/delayed/network/nodes/count", "nodes"),
                      ("/delayed/transactions/all", "tx")):
        try:
            d = http.get_json(f"{ALGO_METRICS}{path}")
            if key == "active":
                out["active_accounts_24h"] = int(d.get("uniq_any") or 0) or None
                out["senders_24h"] = int(d.get("uniq_senders") or 0) or None
            elif key == "open":
                out["open_accounts"] = int(d.get("accounts") or 0) or None
            elif key == "online":
                out["validators_online"] = d.get("online")
                out["online_stake_algo"] = (_f(d.get("stake_micro_algo")) or 0) / 1e6
                out["staking_apy_pct"] = _f(d.get("apy_pct"))
                out["reward_rate_pct"] = _f(d.get("reward_rate_pct"))
            elif key == "nodes":
                out["nodes"] = d.get("nodes")
            elif key == "tx":
                out["tx_total"] = int(d.get("transactions") or 0) or None
                out["tx_smart_contract"] = int(d.get("smart_contract_txn") or 0) or None
            got += 1
        except Exception as e:
            out[f"{key}_error"] = str(e)[:100]
    try:
        _, _, body = http.request(ALGO_SUPPLY, accept="text/plain")
        out["circulating_supply"] = _f(body.decode().strip())
        if out.get("online_stake_algo") and out.get("circulating_supply"):
            out["online_stake_ratio"] = out["online_stake_algo"] / out["circulating_supply"]
        got += 1
    except Exception:
        try:
            sup = http.get_json(f"{ALGOD}/v2/ledger/supply")
            out["online_stake_ratio"] = (_f(sup.get("online-money")) or 0) / (_f(sup.get("total-money")) or 1)
            got += 1
        except Exception:
            pass
    if not got:
        raise http.HttpError("Algorand sin respuesta")
    return out


NETWORK_FETCHERS = {"xrp": fetch_network_xrp, "ada": fetch_network_ada, "algo": fetch_network_algo}


# --------------------------------------------------------------------------
# Yahoo Finance
# --------------------------------------------------------------------------
def fetch_yahoo_quote(coin: dict) -> dict:
    d = http.get_json(YAHOO_CHART.format(sym=coin["yahoo"]))
    r = d["chart"]["result"][0]
    meta = r.get("meta") or {}
    closes = ((r.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    return {
        "symbol": coin["yahoo"],
        "price": _f(meta.get("regularMarketPrice")),
        "change_pct": _f(meta.get("regularMarketChangePercent")),
        "high_52w": _f(meta.get("fiftyTwoWeekHigh")),
        "low_52w": _f(meta.get("fiftyTwoWeekLow")),
        "day_high": _f(meta.get("regularMarketDayHigh")),
        "day_low": _f(meta.get("regularMarketDayLow")),
        "market_time": meta.get("regularMarketTime"),
        "points_1y": len([c for c in closes if c is not None]),
        "url": f"https://finance.yahoo.com/quote/{coin['yahoo']}/",
    }


def fetch_yahoo_news(key: str) -> list:
    q = urllib.parse.quote(YAHOO_NEWS_QUERIES[key])
    d = http.get_json(YAHOO_SEARCH.format(q=q), retries=1)
    items = []
    for n in d.get("news") or []:
        title = n.get("title") or ""
        url = n.get("link") or ""
        ts = n.get("providerPublishTime")
        date = store.iso_from_ts(ts) if ts else None
        item = news.make_item(title=title, url=url, date=date, source=f"Yahoo Finance · {n.get('publisher', '')}".strip(" ·"),
                              source_id="yahoo", kind="medio")
        # Solo si el título menciona la moneda (la búsqueda de Yahoo mezcla notas genéricas).
        if key in item["coins"]:
            items.append(item)
    return items


# --------------------------------------------------------------------------
# Tarea principal
# --------------------------------------------------------------------------
def job_fundamentals(tracker: store.SourceTracker) -> None:
    prev = store.read("fundamentals") or {}
    prev_coins = prev.get("coins") or {}
    coins_out = {k: {} for k in COINS}

    def keep_prev(key, block):
        old = (prev_coins.get(key) or {}).get(block)
        if old:
            old = dict(old)
            old["stale"] = True
            coins_out[key][block] = old

    # CoinGecko
    errs = []
    for key, coin in COINS.items():
        try:
            coins_out[key]["profile"] = _block(fetch_cg_profile(coin), "CoinGecko")
        except Exception as e:
            errs.append(f"{coin['coingecko']}: {e}")
            keep_prev(key, "profile")
    (tracker.fail("coingecko_profile", "; ".join(errs), "CoinGecko · perfil") if errs
     else tracker.ok("coingecko_profile", "CoinGecko · perfil"))

    # CoinMarketCap
    errs = []
    for key, coin in COINS.items():
        try:
            coins_out[key]["cmc"] = _block(fetch_cmc(coin), "CoinMarketCap")
        except Exception as e:
            errs.append(f"{coin['symbol']}: {e}")
            keep_prev(key, "cmc")
    (tracker.fail("coinmarketcap", "; ".join(errs), "CoinMarketCap") if errs
     else tracker.ok("coinmarketcap", "CoinMarketCap", "API key" if KEYS.get("CMC_API_KEY") else "endpoint público"))

    # Messari
    try:
        tax = fetch_messari_taxonomy()
        for key in COINS:
            if key in tax:
                coins_out[key]["messari"] = _block(tax[key], "Messari")
        tracker.ok("messari", "Messari", "taxonomía pública" + (" + API key" if KEYS.get("MESSARI_API_KEY") else ""))
    except Exception as e:
        for key in COINS:
            keep_prev(key, "messari")
        tracker.fail("messari", e, "Messari")

    # Glassnode
    if KEYS.get("GLASSNODE_API_KEY"):
        errs = []
        for key, coin in COINS.items():
            try:
                coins_out[key]["glassnode"] = _block(fetch_glassnode(coin), "Glassnode")
            except Exception as e:
                errs.append(str(e))
        (tracker.fail("glassnode", "; ".join(errs), "Glassnode") if errs else tracker.ok("glassnode", "Glassnode"))
    else:
        tracker.skip("glassnode", "requiere API key (plan pago para XRP/ADA/ALGO)", "Glassnode")

    # DefiLlama
    try:
        llama = fetch_defillama()
        for key in COINS:
            coins_out[key]["defi"] = _block(llama[key], "DefiLlama")
        tracker.ok("defillama", "DefiLlama")
    except Exception as e:
        for key in COINS:
            keep_prev(key, "defi")
        tracker.fail("defillama", e, "DefiLlama")

    # GitHub
    errs = []
    for key, coin in COINS.items():
        try:
            dev = fetch_dev(coin, (prev_coins.get(key) or {}).get("dev"))
            coins_out[key]["dev"] = _block(dev, "GitHub")
            if dev.get("errors"):
                errs.extend(dev["errors"])
        except Exception as e:
            errs.append(f"{coin['symbol']}: {e}")
            keep_prev(key, "dev")
    (tracker.fail("github", "; ".join(errs)[:240], "GitHub") if errs
     else tracker.ok("github", "GitHub", "con token" if KEYS.get("GITHUB_TOKEN") else "sin token (60 req/h)"))

    # Redes
    for key, fn in NETWORK_FETCHERS.items():
        label = {"xrp": "XRPL · XRPScan", "ada": "Cardano · Koios", "algo": "Algorand Foundation · métricas"}[key]
        try:
            coins_out[key]["network"] = _block(fn(), label)
            tracker.ok(f"network_{key}", label)
        except Exception as e:
            keep_prev(key, "network")
            tracker.fail(f"network_{key}", e, label)

    # Yahoo Finance (cotización de referencia + rango 52 semanas)
    errs = []
    for key, coin in COINS.items():
        try:
            coins_out[key]["yahoo"] = _block(fetch_yahoo_quote(coin), "Yahoo Finance")
        except Exception as e:
            errs.append(f"{coin['yahoo']}: {e}")
            keep_prev(key, "yahoo")
    (tracker.fail("yahoo", "; ".join(errs), "Yahoo Finance") if errs else tracker.ok("yahoo", "Yahoo Finance"))

    # Noticias de medios: Cryptodaily (RSS) + Yahoo Finance (búsqueda)
    media, errs = [], []
    for feed in MEDIA_FEEDS:
        try:
            raw = news.parse_feed(http.get_text(feed["url"], timeout=45))
            for it in raw:
                item = news.make_item(title=it["title"], url=it["link"], date=it["date"], source=feed["name"],
                                      source_id=feed["id"], kind="medio", summary=it["summary"],
                                      categories=it["categories"])
                if item["coins"]:
                    media.append(item)
            tracker.ok(feed["id"], feed["name"])
        except Exception as e:
            errs.append(f"{feed['name']}: {e}")
            tracker.fail(feed["id"], e, feed["name"])
    ynews_ok = 0
    for key in COINS:
        try:
            media.extend(fetch_yahoo_news(key))
            ynews_ok += 1
        except Exception:
            pass
    (tracker.ok("yahoo_news", "Yahoo Finance · noticias") if ynews_ok
     else tracker.fail("yahoo_news", "sin respuesta", "Yahoo Finance · noticias"))
    if not media:
        media = [dict(m, stale=True) for m in (prev.get("media_news") or [])]
    # Deduplicar por título normalizado y ordenar
    seen, dedup = set(), []
    for m in sorted(media, key=lambda x: x.get("date") or "", reverse=True):
        k = re.sub(r"[^a-z0-9]", "", (m.get("title") or "").lower())[:80]
        if k and k not in seen:
            seen.add(k)
            dedup.append(m)
    out = {"fetched_at": store.now_iso(), "fetched_ts": store.now_ms(), "coins": coins_out,
           "media_news": dedup[:80]}
    store.write("fundamentals", out)
