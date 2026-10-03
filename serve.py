#!/usr/bin/env python3
"""Monitor Cripto — servidor local + programador de actualizaciones.

Uso:
  python serve.py                 sirve el tablero en http://localhost:8080 y actualiza los datos solo
  python serve.py --port 9000     otro puerto
  python serve.py --lan           accesible desde otros dispositivos de tu red (celular, tablet)
  python serve.py --no-browser    no abrir el navegador
  python serve.py --no-scheduler  solo servir archivos (sin scripts)
  python serve.py --no-api        deshabilitar /api/run (recomendado si lo publicás con un túnel)

Seguridad: solo se sirven index.html, assets/ y data/. config.local.json (claves) nunca se expone.
La ruta /api/run (forzar una tarea) solo acepta pedidos desde esta misma computadora.
"""
from __future__ import annotations

import argparse
import http.server
import json
import os
import socket
import sys
import threading
import time
import urllib.parse
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from monitor_core import runner, store  # noqa: E402
from monitor_core.config import JOB_ORDER  # noqa: E402

ALLOWED_PREFIXES = ("/assets/", "/data/")
ALLOWED_FILES = {"/", "/index.html", "/favicon.ico"}
LOCAL_ADDRS = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}
_last_manual: dict = {}
STATE = {"scheduler": None, "started": time.time()}


class Handler(http.server.SimpleHTTPRequestHandler):
    server_version = "MonitorCripto/1.0"
    sys_version = ""
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map,
                          **{".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
                             ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml"})

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # -------------------------------------------------------------- utilidades
    def _path(self) -> str:
        return urllib.parse.urlsplit(self.path).path

    def _allowed(self) -> bool:
        p = urllib.parse.unquote(self._path())
        if "/." in p or "\\" in p or ".." in p:
            return False
        return p in ALLOWED_FILES or p.startswith(ALLOWED_PREFIXES)

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        p = self._path()
        if p.startswith("/data/") or p.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def log_message(self, fmt, *args):  # silencioso salvo errores HTTP
        code = str(args[1]) if len(args) > 1 else ""
        if code[:1] in ("4", "5"):
            runner.log(f"HTTP {code} {args[0]}")

    # -------------------------------------------------------------- métodos
    def do_GET(self):
        p = self._path()
        if p == "/api/health":
            sched = STATE["scheduler"]
            status = store.read("status", {}) or {}
            return self._json({"ok": True, "scheduler": bool(sched and sched.is_alive()),
                               "uptime_s": int(time.time() - STATE["started"]), "jobs": status.get("jobs", {})})
        if not self._allowed():
            return self.send_error(404, "No encontrado")
        return super().do_GET()

    def do_HEAD(self):
        if not self._allowed():
            return self.send_error(404, "No encontrado")
        return super().do_HEAD()

    def do_POST(self):
        p = self._path()
        if p != "/api/run":
            return self.send_error(404, "No encontrado")
        proxied = any(self.headers.get(h) for h in ("X-Forwarded-For", "CF-Connecting-IP", "Forwarded", "X-Real-IP"))
        if STATE.get("no_api") or proxied or self.client_address[0] not in LOCAL_ADDRS:
            # Detrás de un túnel/proxy (Cloudflare, Nginx) el pedido llega desde 127.0.0.1: se rechaza igual.
            return self._json({"ok": False, "error": "solo disponible desde esta computadora"}, 403)
        job = (urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("job") or [""])[0]
        if job not in runner.JOBS:
            return self._json({"ok": False, "error": f"tarea desconocida; válidas: {', '.join(JOB_ORDER)}"}, 400)
        if time.time() - _last_manual.get(job, 0) < 30:
            return self._json({"ok": False, "error": "esperá 30 segundos entre ejecuciones manuales"}, 429)
        _last_manual[job] = time.time()
        ok = runner.run_job(job)
        return self._json({"ok": ok, "job": job, "status": (store.read("status", {}) or {}).get("jobs", {}).get(job)})


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main() -> int:
    ap = argparse.ArgumentParser(description="Monitor Cripto — servidor local")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--lan", action="store_true", help="escuchar en todas las interfaces (red local)")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--no-scheduler", action="store_true")
    ap.add_argument("--no-api", action="store_true", help="deshabilitar /api/run (forzar tareas)")
    args = ap.parse_args()

    STATE["no_api"] = args.no_api
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    httpd = None
    for port in range(args.port, args.port + 11):
        try:
            httpd = http.server.ThreadingHTTPServer((host, port), Handler)
            break
        except OSError:
            continue
    if not httpd:
        print(f"No hay puertos libres entre {args.port} y {args.port + 10}.")
        return 1
    port = httpd.server_address[1]
    url = f"http://localhost:{port}/"
    runner.log(f"Monitor Cripto en {url}" + (f"  ·  en tu red: http://{lan_ip()}:{port}/" if args.lan else ""))
    runner.log("Cerrá esta ventana o presioná Ctrl+C para detenerlo.")

    if not args.no_scheduler:
        sched = runner.Scheduler()
        STATE["scheduler"] = sched
        sched.start()
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        runner.log("Detenido.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
