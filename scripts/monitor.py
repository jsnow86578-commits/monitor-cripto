#!/usr/bin/env python3
"""Monitor Cripto — extracción de datos para el tablero XRP · ADA · ALGO.

Uso:
  python scripts/monitor.py                  ejecuta solo las tareas vencidas
  python scripts/monitor.py all              fuerza todas las tareas
  python scripts/monitor.py prices official  fuerza tareas específicas
  python scripts/monitor.py --loop           modo continuo (programador)
  python scripts/monitor.py --status         muestra el estado de tareas y fuentes

Tareas: prices (1h) · candles (1h) · feargreed (3h) · history (6h) · fundamentals (6h) · official (12h)
Claves opcionales: config.local.json o variables de entorno (ver README).
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from monitor_core import runner  # noqa: E402
from monitor_core.config import JOB_ORDER  # noqa: E402


def main(argv: list) -> int:
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    if "--help" in flags or "-h" in argv:
        print(__doc__)
        return 0
    if "--status" in flags:
        runner.print_status()
        return 0
    if "--loop" in flags:
        sched = runner.Scheduler()
        sched.start()
        try:
            while sched.is_alive():
                sched.join(1.0)
        except KeyboardInterrupt:
            runner.log("Detenido por el usuario.")
        return 0
    if not args:
        ran = runner.run_due()
        if not ran:
            runner.log("No hay tareas vencidas. Usá 'all' para forzar o '--status' para ver el estado.")
        return 0
    names = JOB_ORDER if "all" in args else args
    unknown = [n for n in names if n not in runner.JOBS]
    if unknown:
        print(f"Tareas desconocidas: {', '.join(unknown)}. Válidas: {', '.join(JOB_ORDER)}")
        return 2
    results = [runner.run_job(n) for n in names]
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
