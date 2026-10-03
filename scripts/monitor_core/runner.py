"""Ejecución de tareas y programador con las frecuencias del proyecto."""
from __future__ import annotations

import sys
import threading
import time
import traceback
from datetime import datetime

from . import store
from .config import JOB_INTERVALS, JOB_ORDER
from .jobs_fund import job_fundamentals
from .jobs_market import job_candles, job_feargreed, job_history, job_prices
from .jobs_official import job_official

JOBS = {
    "prices": job_prices,
    "candles": job_candles,
    "feargreed": job_feargreed,
    "history": job_history,
    "fundamentals": job_fundamentals,
    "official": job_official,
}
LABELS = {
    "prices": "Precios (CoinGecko)",
    "candles": "Velas 4h (Binance)",
    "feargreed": "Miedo y Codicia",
    "history": "Historia diaria",
    "fundamentals": "Fundamentales",
    "official": "Fuentes oficiales",
}
RETRY_AFTER_FAIL = 10 * 60      # reintento tras un error (segundos)
EARLY_SLACK = 60                # tolerancia para considerar vencida una tarea

_run_lock = threading.Lock()
_running: set = set()

try:  # consola de Windows: nunca romper por un carácter no representable
    sys.stdout.reconfigure(errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def run_job(name: str) -> bool:
    if name not in JOBS:
        raise KeyError(name)
    with _run_lock:
        if name in _running:
            log(f"{LABELS[name]}: ya se está ejecutando, se omite")
            return False
        _running.add(name)
    tracker = store.SourceTracker()
    t0 = time.time()
    ok, err = True, None
    try:
        JOBS[name](tracker)
    except Exception as e:  # noqa: BLE001 — se registra y se sigue
        ok, err = False, str(e)[:300]
        if "--debug" in sys.argv:
            traceback.print_exc()
    finally:
        with _run_lock:
            _running.discard(name)
    dur = time.time() - t0
    store.update_status(name, ok, dur, err, tracker)
    try:
        store.write_snapshot()
    except Exception as e:  # noqa: BLE001
        log(f"snapshot.js: no se pudo escribir ({e})")
    fails = [v.get("label", k) for k, v in tracker.results.items() if v.get("ok") is False]
    if ok:
        extra = f" (con avisos: {', '.join(fails)})" if fails else ""
        log(f"OK    {LABELS[name]} en {dur:.1f}s{extra}")
    else:
        log(f"ERROR {LABELS[name]}: {err}")
    return ok


def seconds_until_due(name: str, now: float | None = None) -> float:
    now = now or time.time()
    status = (store.read("status", {}) or {}).get("jobs", {}).get(name, {})
    interval = JOB_INTERVALS[name]
    last_ok = store.parse_iso(status.get("last_ok"))
    last_run = store.parse_iso(status.get("last_run"))
    if last_ok is None:
        due = (last_run + RETRY_AFTER_FAIL) if (last_run and status.get("ok") is False) else now
    else:
        due = last_ok + interval
        if status.get("ok") is False and last_run and last_run > last_ok:
            due = max(due, last_run + RETRY_AFTER_FAIL)
    return max(0.0, due - now)


def due_jobs() -> list:
    return [n for n in JOB_ORDER if seconds_until_due(n) <= EARLY_SLACK]


def run_due() -> list:
    ran = []
    for name in due_jobs():
        run_job(name)
        ran.append(name)
    return ran


class Scheduler(threading.Thread):
    """Ejecuta cada tarea cuando vence según JOB_INTERVALS."""

    def __init__(self):
        super().__init__(daemon=True, name="monitor-scheduler")
        self._stop = threading.Event()

    def stop(self):
        self._stop.set()

    def run(self):
        log("Programador iniciado: precios 1h · velas 1h · miedo/codicia 3h · historia 6h · "
            "fundamentales 6h · oficiales 12h")
        while not self._stop.is_set():
            try:
                run_due()
            except Exception as e:  # noqa: BLE001
                log(f"programador: error inesperado {e}")
            waits = [seconds_until_due(n) for n in JOB_ORDER]
            sleep_for = max(20.0, min(300.0, min(waits) if waits else 300.0))
            self._stop.wait(sleep_for)


def print_status() -> None:
    status = store.read("status", {}) or {}
    jobs = status.get("jobs", {})
    print("\nTarea                 Último OK              Próxima en   Estado")
    print("-" * 72)
    for n in JOB_ORDER:
        j = jobs.get(n, {})
        left = seconds_until_due(n)
        h, m = int(left // 3600), int(left % 3600 // 60)
        state = "ok" if j.get("ok") else ("error: " + (j.get("error") or "")[:40] if j else "sin ejecutar")
        print(f"{LABELS[n]:<22}{(j.get('last_ok') or '-'):<23}{h:>3}h {m:02d}m    {state}")
    srcs = status.get("sources", {})
    if srcs:
        print("\nFuentes:")
        for k, v in sorted(srcs.items(), key=lambda kv: kv[1].get("label", kv[0])):
            mark = "OK " if v.get("ok") else ("-- " if v.get("ok") is None else "ERR")
            note = v.get("error") or v.get("note") or ""
            print(f"  [{mark}] {v.get('label', k):<38} {note[:70]}")
    print()
