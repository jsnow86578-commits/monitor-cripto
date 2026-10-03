"""Lectura de feeds RSS/Atom y páginas oficiales + clasificación de noticias."""
from __future__ import annotations

import hashlib
import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from .config import COINS, FEED_CATEGORY_MAP, TAG_RULES

_TAG_RX = [(name, re.compile(rx, re.I)) for name, rx in TAG_RULES]
_COIN_RX = {k: re.compile("|".join(c["keywords"]), re.I if k != "ada" else 0) for k, c in COINS.items()}
# "ADA" en mayúsculas es ambiguo con minúsculas; Cardano sí se busca sin distinguir mayúsculas.
_COIN_RX["ada"] = re.compile(r"\bCardano\b|Hoskinson|Input Output|\bIntersectMBO\b|(?<![A-Za-z])ADA(?![A-Za-z])",
                             re.I)

MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july",
                                       "august", "september", "october", "november", "december"], 1)}
MONTHS.update({m[:3]: i for m, i in list(MONTHS.items())})


# --------------------------------------------------------------------------
# Utilidades de texto y fechas
# --------------------------------------------------------------------------
def clean_text(value: str | None, limit: int = 0) -> str:
    if not value:
        return ""
    txt = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", value, flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = html.unescape(txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    if limit and len(txt) > limit:
        cut = txt[:limit].rsplit(" ", 1)[0]
        txt = cut.rstrip(",.;:") + "…"
    return txt


def to_iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    try:
        return to_iso(parsedate_to_datetime(value))
    except (TypeError, ValueError, IndexError):
        pass
    try:
        return to_iso(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        pass
    m = re.search(r"([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})", value)        # September 29, 2026
    if m and m.group(1).lower() in MONTHS:
        return to_iso(datetime(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2)), 12, tzinfo=timezone.utc))
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", value)                        # 09/09/2026 (mm/dd/yyyy)
    if m:
        try:
            return to_iso(datetime(int(m.group(3)), int(m.group(1)), int(m.group(2)), 12, tzinfo=timezone.utc))
        except ValueError:
            return None
    return None


def item_id(url: str, title: str) -> str:
    return hashlib.sha1((url or title).encode("utf-8")).hexdigest()[:12]


# --------------------------------------------------------------------------
# Clasificación
# --------------------------------------------------------------------------
def detect_coins(text: str) -> list:
    found = []
    for key in COINS:
        if _COIN_RX[key].search(text):
            found.append(key)
    return found


def classify(title: str, summary: str = "", categories=None) -> list:
    scores: dict = {}
    for name, rx in _TAG_RX:
        s = 0
        if rx.search(title or ""):
            s += 2
        if rx.search(summary or ""):
            s += 1
        if s:
            scores[name] = scores.get(name, 0) + s
    for cat in categories or []:
        mapped = FEED_CATEGORY_MAP.get((cat or "").strip().lower())
        if mapped:
            scores[mapped] = scores.get(mapped, 0) + 3
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    tags = [name for name, sc in ranked if sc >= 2][:3]
    if not tags and ranked:
        tags = [ranked[0][0]]
    return tags


def make_item(*, title: str, url: str, date: str | None, source: str, source_id: str, kind: str,
              summary: str = "", coins=None, categories=None) -> dict:
    title = clean_text(title, 220)
    summary = clean_text(summary, 260)
    if coins is None:
        coins = detect_coins(f"{title} {summary} {' '.join(categories or [])}")
    return {
        "id": item_id(url, title),
        "title": title,
        "url": url,
        "date": date,
        "source": source,
        "source_id": source_id,
        "kind": kind,                       # "oficial" | "medio"
        "coins": coins,
        "tags": classify(title, summary, categories),
        "categories": [clean_text(c, 40) for c in (categories or []) if c][:5],
        "summary": summary,
    }


# --------------------------------------------------------------------------
# RSS / Atom
# --------------------------------------------------------------------------
_NS = {"atom": "http://www.w3.org/2005/Atom", "content": "http://purl.org/rss/1.0/modules/content/",
       "dc": "http://purl.org/dc/elements/1.1/"}


def parse_feed(xml_text: str) -> list:
    """Devuelve dicts {title, link, date, summary, categories} (RSS 2.0 y Atom)."""
    # Algunos feeds traen basura antes del prólogo XML.
    xml_text = xml_text[xml_text.find("<"):] if "<" in xml_text else xml_text
    root = ET.fromstring(xml_text.encode("utf-8"))
    out = []
    for it in root.iter("item"):
        out.append({
            "title": it.findtext("title") or "",
            "link": (it.findtext("link") or "").strip(),
            "date": parse_date(it.findtext("pubDate") or it.findtext("dc:date", namespaces=_NS)),
            "summary": it.findtext("description") or "",
            "categories": [c.text for c in it.findall("category") if c.text],
        })
    if not out:
        for e in root.iter("{http://www.w3.org/2005/Atom}entry"):
            link = ""
            for l in e.findall("atom:link", _NS):
                if l.get("rel", "alternate") == "alternate":
                    link = l.get("href", "")
                    break
            out.append({
                "title": e.findtext("atom:title", default="", namespaces=_NS),
                "link": link,
                "date": parse_date(e.findtext("atom:published", namespaces=_NS)
                                   or e.findtext("atom:updated", namespaces=_NS)),
                "summary": e.findtext("atom:summary", default="", namespaces=_NS)
                or e.findtext("atom:content", default="", namespaces=_NS),
                "categories": [c.get("term") for c in e.findall("atom:category", _NS) if c.get("term")],
            })
    return out


# --------------------------------------------------------------------------
# Parsers HTML de sitios oficiales sin RSS
# --------------------------------------------------------------------------
_MONTH_RX = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"


def parse_ripple_insights(page: str, base: str = "https://ripple.com") -> list:
    """Tarjetas de ripple.com/insights: '01 Título Mes DD, AAAA'."""
    best: dict = {}
    for m in re.finditer(r'<a[^>]+href="(/insights/[a-z0-9\-]+/?)"[^>]*>(.*?)</a>', page, re.S | re.I):
        href = m.group(1)
        text = clean_text(m.group(2))
        if not text or text.lower() in ("read more", "learn more"):
            continue
        dm = re.search(rf"^(?:\d{{1,2}}\s+)?(.*?)\s+({_MONTH_RX}\s+\d{{1,2}},\s+\d{{4}})$", text)
        entry = best.setdefault(href, {"title": "", "date": None})
        if dm:
            entry["title"] = dm.group(1).strip()
            entry["date"] = parse_date(dm.group(2))
        elif len(text) > len(entry["title"]) and not entry["date"]:
            entry["title"] = re.sub(r"^\d{1,2}\s+", "", text)
    items = []
    for href, e in best.items():
        if e["title"] and len(e["title"]) > 8:
            items.append({"title": e["title"], "link": base + href, "date": e["date"], "summary": "",
                          "categories": []})
    return items


def parse_xrpl_blog(page: str, base: str = "https://xrpl.org") -> list:
    items, seen = [], set()
    chunks = re.split(r'(?=<div class="[^"]*\blabel blog-category-)', page)
    for idx, ch in enumerate(chunks[1:], start=1):
        cat_m = re.match(r'<div class="[^"]*blog-category-[a-z_]+"[^>]*>([^<]+)</div>', ch)
        link_m = re.search(r'href="(/blog/\d{4}/[^"#?]+)"[^>]*>([^<]{6,})</a>', ch)
        if not link_m:
            continue
        href = link_m.group(1)
        if href in seen:
            continue
        seen.add(href)
        date = None
        dm = re.search(r'card-date">([^<]+)<', ch)
        if dm:
            date = parse_date(dm.group(1))
        else:
            # Formato del destacado (hero): 'Sep</span> <!-- -->25 2026'
            # (la fecha del destacado aparece antes de la etiqueta de categoría → buscar también atrás)
            tail = chunks[idx - 1][-1500:] + ch
            hm = re.search(r'hero-post-date[^>]*>([A-Za-z]{3,9})</span>\s*(?:<!--\s*-->)?\s*(\d{1,2})\s+(\d{4})', tail)
            if hm:
                date = parse_date(f"{hm.group(1)} {hm.group(2)}, {hm.group(3)}")
        sm = re.search(r'<p class="(?:line-clamp|mb-4)">(.*?)</p>', ch, re.S)
        items.append({
            "title": link_m.group(2),
            "link": base + href,
            "date": date,
            "summary": sm.group(1) if sm else "",
            "categories": [cat_m.group(1)] if cat_m else [],
        })
    return items


# --------------------------------------------------------------------------
# Estadísticas oficiales publicadas en los sitios
# --------------------------------------------------------------------------
def _num(s: str):
    s = s.replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_ripple_xrp_stats(page: str) -> dict:
    """Cifras públicas de ripple.com/xrp (tenencias y escrow de Ripple, métricas de uso)."""
    text = clean_text(page)
    out = {}
    for key, label in (("held_by_ripple", "TOTAL XRP HELD BY RIPPLE"),
                       ("distributed", "TOTAL XRP DISTRIBUTED"),
                       ("in_escrow", "TOTAL XRP PLACED IN ESCROW")):
        m = re.search(label + r":?\s*([\d,]+)", text, re.I)
        if m:
            out[key] = _num(m.group(1))
    m = re.search(r"As of\s+(\d{2})/(\d{2})/(\d{2,4})", text)
    if m:
        yy = int(m.group(3))
        yy = yy + 2000 if yy < 100 else yy
        out["as_of"] = f"{yy:04d}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    hero = {}
    for key, rx in (("transactions", r"([\d.,]+[KMBT]?\+?)\s*Transactions Processed"),
                    ("wallets", r"([\d.,]+[KMBT]?\+?)\s*XRP Wallets"),
                    ("value_moved", r"(\$[\d.,]+[KMBT]?\+?)\s*Value Moved")):
        mm = re.search(rx, text, re.I)
        if mm:
            hero[key] = mm.group(1)
    if hero:
        out["headline"] = hero
    return out


def parse_cardano_home_stats(page: str) -> dict:
    text = clean_text(page)
    out = {}
    m = re.search(r"transactions on Cardano in 30 days\s*([\d,]+)", text, re.I)
    if m:
        out["tx_30d"] = _num(m.group(1))
    m = re.search(r"attributed to showcased apps\s*([\d,]+)", text, re.I)
    if m:
        out["tx_30d_apps"] = _num(m.group(1))
    m = re.search(r"curated apps to explore\s*([\d,]+)", text, re.I)
    if m:
        out["apps"] = _num(m.group(1))
    m = re.search(r"Snapshot of the 30 days from (.+?\d{4})\.", text)
    if m:
        out["window"] = m.group(1)
        wm = re.match(r"([A-Za-z]+)\s+(\d{1,2})\s+to\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", m.group(1))
        if wm and wm.group(1).lower() in MONTHS and wm.group(3).lower() in MONTHS:
            y = int(wm.group(5))
            m1, m2 = MONTHS[wm.group(1).lower()], MONTHS[wm.group(3).lower()]
            out["window_start"] = f"{y - 1 if m1 > m2 else y:04d}-{m1:02d}-{int(wm.group(2)):02d}"
            out["window_end"] = f"{y:04d}-{m2:02d}-{int(wm.group(4)):02d}"
    return out
