# Publicar el tablero en internet

> **Estado: publicado en GitHub Pages** → https://jsnow86578-commits.github.io/monitor-cripto/
> (repositorio https://github.com/jsnow86578-commits/monitor-cripto, workflow `.github/workflows/publicar.yml`). Lo que sigue queda como referencia de alternativas.

El sitio es estático (HTML + CSS + JS + `data/*.json`), así que se puede publicar en casi cualquier lado.
Lo único que necesita "un motor" es la actualización de fundamentales y noticias (`scripts/monitor.py`).
Estas son las opciones que tienen sentido, de menor a mayor control:

| Opción | Costo | Qué corre los scripts | Notas |
|---|---|---|---|
| **GitHub Pages + Actions** ✅ activo | Gratis | GitHub Actions cada hora | Workflow `.github/workflows/publicar.yml` (copia en `deploy/github-actions.yml`). El repo queda público en el plan gratuito. |
| **Cloudflare Pages / Netlify** | Gratis | Un cron externo (Actions) que hace deploy | Buen CDN; requiere conectar el repo. |
| **Tu PC o VM + Cloudflare Tunnel** | Gratis | `serve.py` en tu equipo | Sin abrir puertos en el router ni en OPNsense; podés protegerlo con Cloudflare Access (login). |
| **VPS chico (1 vCPU)** | ~US$ 4–6/mes | `serve.py` como servicio (systemd) | Control total; detrás de Caddy/Nginx con HTTPS automático. |

## Cómo quedó configurado GitHub Pages
1. Repositorio público con todo el proyecto (sin `config.local.json`, que está en `.gitignore`).
2. Settings → Pages → *Source: GitHub Actions* (el workflow arma el sitio solo con `index.html`, `assets/` y `data/`).
3. `.github/workflows/publicar.yml`: cada hora corre las tareas vencidas, guarda `data/` y publica.
4. Opcional: claves en Settings → Secrets and variables → Actions (`COINGECKO_API_KEY` recomendada).
5. Forzar: Actions → "Actualizar y publicar" → *Run workflow* (`all` para todo).

## Pasos rápidos — Cloudflare Tunnel (desde tu VM)
1. `python serve.py --no-browser` como servicio (Programador de tareas de Windows o systemd en WSL).
2. `cloudflared tunnel --url http://localhost:8080` (prueba) o un túnel con nombre + dominio propio.
3. Recomendado: Cloudflare Access para que solo vos (o quien autorices) pueda entrar.

> Seguridad: `serve.py` solo sirve `index.html`, `assets/` y `data/`; `config.local.json` nunca se expone
> y la ruta para forzar tareas (`/api/run`) solo responde a pedidos directos desde la misma computadora
> (rechaza los que llegan por un túnel o proxy). Si lo publicás, podés apagarla del todo con `--no-api`.
