"""Tarea de fuentes oficiales (cada 12 h): Ripple, XRPL.org, Cardano y Algorand."""
from __future__ import annotations

from . import http, news, store
from .config import OFFICIAL_SITES, OFFICIAL_SOURCES

PER_SOURCE = 15


def _fetch_source(src: dict) -> list:
    if src["kind"] == "rss":
        raw = news.parse_feed(http.get_text(src["url"], timeout=40))
    elif src["kind"] == "ripple_insights":
        raw = news.parse_ripple_insights(http.get_text(src["url"], timeout=40))
    elif src["kind"] == "xrpl_blog":
        raw = news.parse_xrpl_blog(http.get_text(src["url"], timeout=40))
    else:
        raise ValueError(f"tipo de fuente desconocido: {src['kind']}")
    if not raw:
        raise http.HttpError("la página no devolvió artículos (¿cambió el diseño del sitio?)")
    items = []
    for it in raw:
        item = news.make_item(title=it["title"], url=it["link"], date=it["date"], source=src["name"],
                              source_id=src["id"], kind="oficial", summary=it.get("summary", ""),
                              categories=it.get("categories"))
        coins = [src["coin"]] + [c for c in item["coins"] if c != src["coin"]]
        item["coins"] = coins
        items.append(item)
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    return items[:PER_SOURCE]


def job_official(tracker: store.SourceTracker) -> None:
    prev = store.read("official") or {}
    prev_items = prev.get("news") or []
    all_items, failed_sources = [], []
    for src in OFFICIAL_SOURCES:
        try:
            items = _fetch_source(src)
            all_items.extend(items)
            tracker.ok(src["id"], src["name"], f"{len(items)} artículos")
        except Exception as e:
            failed_sources.append(src["id"])
            tracker.fail(src["id"], e, src["name"])
            all_items.extend(dict(i, stale=True) for i in prev_items if i.get("source_id") == src["id"])

    stats = dict(prev.get("stats") or {})
    # ripple.com/xrp — tenencias de Ripple / escrow / métricas declaradas
    try:
        s = news.parse_ripple_xrp_stats(http.get_text(OFFICIAL_SITES["xrp"], timeout=40))
        if not s.get("held_by_ripple"):
            raise http.HttpError("no se encontraron las cifras de escrow en ripple.com/xrp")
        stats["xrp"] = dict(s, updated_at=store.now_iso(), source="ripple.com/xrp", url=OFFICIAL_SITES["xrp"])
        tracker.ok("ripple_xrp", "ripple.com/xrp")
    except Exception as e:
        if stats.get("xrp"):
            stats["xrp"]["stale"] = True
        tracker.fail("ripple_xrp", e, "ripple.com/xrp")
    # cardano.org — "Cardano in use"
    try:
        s = news.parse_cardano_home_stats(http.get_text("https://cardano.org/", timeout=40))
        if not s:
            raise http.HttpError("no se encontraron métricas en cardano.org")
        stats["ada"] = dict(s, updated_at=store.now_iso(), source="cardano.org", url="https://cardano.org/")
        tracker.ok("cardano_home", "cardano.org · métricas")
    except Exception as e:
        if stats.get("ada"):
            stats["ada"]["stale"] = True
        tracker.fail("cardano_home", e, "cardano.org · métricas")
    # cardanofoundation.org usa una verificación anti-bots (Vercel): se enlaza, no se lee.
    tracker.skip("cardanofoundation", "solo enlace: el sitio bloquea lectores automáticos (Vercel Security "
                                      "Checkpoint); las novedades oficiales se toman de cardano.org",
                 "Cardano Foundation")

    # Deduplicar y ordenar
    seen, dedup = set(), []
    for it in sorted(all_items, key=lambda x: x.get("date") or "", reverse=True):
        if it["id"] not in seen:
            seen.add(it["id"])
            dedup.append(it)
    if not dedup:
        raise http.HttpError("ninguna fuente oficial respondió")
    store.write("official", {
        "fetched_at": store.now_iso(), "fetched_ts": store.now_ms(),
        "news": dedup[:90],
        "stats": stats,
        "sites": OFFICIAL_SITES,
        "failed_sources": failed_sources,
    })
