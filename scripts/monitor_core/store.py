"""Lectura/escritura de los JSON de /data, estado de tareas y snapshot.js."""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from datetime import datetime, timezone

from .config import DATA_DIR, JOB_INTERVALS

FILES = {
    "prices": "prices.json",
    "candles4h": "candles_4h.json",
    "candles1d": "candles_1d.json",
    "history": "history.json",
    "feargreed": "fear_greed.json",
    "fundamentals": "fundamentals.json",
    "official": "official.json",
    "status": "status.json",
}
_write_lock = threading.RLock()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def now_ms() -> int:
    return int(time.time() * 1000)


def iso_from_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def path_for(key: str):
    return DATA_DIR / FILES[key]


def read(key: str, default=None):
    p = path_for(key)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:
        return default


def write(key: str, obj, compact: bool = True) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":") if compact else None,
                      indent=None if compact else 2)
    _atomic_write(path_for(key), text)


def _atomic_write(path, text: str) -> None:
    with _write_lock:
        fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            try:
                os.chmod(tmp, 0o644)   # legible por servidores web (mkstemp crea 0600)
            except OSError:
                pass
            for attempt in range(8):
                try:
                    os.replace(tmp, path)
                    break
                except PermissionError:   # Windows: el archivo puede estar abierto por el servidor web
                    if attempt == 7:
                        raise
                    time.sleep(0.15 * (attempt + 1))
        finally:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass


def envelope(source: str, payload, **extra) -> dict:
    out = {"fetched_at": now_iso(), "fetched_ts": now_ms(), "source": source}
    out.update(extra)
    out["payload"] = payload
    return out


# --------------------------------------------------------------------------
# Estado de tareas y fuentes
# --------------------------------------------------------------------------
class SourceTracker:
    """Registra éxito/fracaso de cada fuente consultada durante una tarea."""

    def __init__(self):
        self.results: dict = {}

    def ok(self, source: str, label: str | None = None, note: str | None = None):
        self.results[source] = {"ok": True, "label": label or source, "error": None, "note": note,
                                "checked_at": now_iso()}

    def fail(self, source: str, error, label: str | None = None):
        msg = str(error)
        self.results[source] = {"ok": False, "label": label or source, "error": msg[:240],
                                "checked_at": now_iso()}

    def skip(self, source: str, reason: str, label: str | None = None):
        self.results[source] = {"ok": None, "label": label or source, "error": None, "note": reason,
                                "checked_at": now_iso()}


def update_status(job: str, ok: bool, duration: float, error: str | None, tracker: SourceTracker | None):
    with _write_lock:
        status = read("status", {}) or {}
        jobs = status.setdefault("jobs", {})
        sources = status.setdefault("sources", {})
        entry = jobs.get(job, {})
        ts = now_iso()
        entry.update({
            "last_run": ts,
            "ok": ok,
            "duration_s": round(duration, 2),
            "error": error,
            "interval_s": JOB_INTERVALS.get(job),
        })
        if ok:
            entry["last_ok"] = ts
        last_ok_ts = parse_iso(entry.get("last_ok")) or time.time()
        entry["next_due"] = iso_from_ts(last_ok_ts + (JOB_INTERVALS.get(job) or 3600))
        jobs[job] = entry
        if tracker:
            for name, res in tracker.results.items():
                prev = sources.get(name, {})
                merged = dict(prev)
                merged.update(res)
                merged["job"] = job
                if res.get("ok"):
                    merged["last_ok"] = res["checked_at"]
                sources[name] = merged
        status["generated_at"] = ts
        write("status", status, compact=False)


def job_last_ok(job: str) -> float | None:
    status = read("status", {}) or {}
    return parse_iso(((status.get("jobs") or {}).get(job) or {}).get("last_ok"))


# --------------------------------------------------------------------------
# snapshot.js — permite abrir index.html con doble clic (file://)
# --------------------------------------------------------------------------
def write_snapshot() -> None:
    with _write_lock:
        snap = {"generated_at": now_iso()}
        for key in FILES:
            data = read(key)
            if data is not None:
                snap[key] = data
        text = ("/* Generado automáticamente por scripts/monitor.py — no editar a mano. */\n"
                "window.MC_SNAPSHOT = " + json.dumps(snap, ensure_ascii=False, separators=(",", ":")) + ";\n")
        _atomic_write(DATA_DIR / "snapshot.js", text)
