# Publicar el tablero en internet (lo definimos juntos)

El sitio es estático (HTML + CSS + JS + `data/*.json`), así que se puede publicar en casi cualquier lado.
Lo único que necesita "un motor" es la actualización de fundamentales y noticias (`scripts/monitor.py`).
Estas son las opciones que tienen sentido, de menor a mayor control:

| Opción | Costo | Qué corre los scripts | Notas |
|---|---|---|---|
| **GitHub Pages + Actions** | Gratis | GitHub Actions cada hora | Plantilla lista en `deploy/github-actions.yml`. URL tipo `usuario.github.io/monitor-cripto`. El repo queda público en el plan gratuito. |
| **Cloudflare Pages / Netlify** | Gratis | Un cron externo (Actions) que hace deploy | Buen CDN; requiere conectar el repo. |
| **Tu PC o VM + Cloudflare Tunnel** | Gratis | `serve.py` en tu equipo | Sin abrir puertos en el router ni en OPNsense; podés protegerlo con Cloudflare Access (login). |
| **VPS chico (1 vCPU)** | ~US$ 4–6/mes | `serve.py` como servicio (systemd) | Control total; detrás de Caddy/Nginx con HTTPS automático. |

## Pasos rápidos — GitHub Pages
1. Crear un repositorio y subir esta carpeta (sin `config.local.json`, ya está en `.gitignore`).
2. Copiar `deploy/github-actions.yml` a `.github/workflows/actualizar-datos.yml`.
3. Settings → Pages → *Deploy from a branch* → `main` / raíz.
4. (Opcional) cargar claves en Settings → Secrets → Actions.
5. Actions → "Actualizar datos del tablero" → *Run workflow* para la primera carga.

## Pasos rápidos — Cloudflare Tunnel (desde tu VM)
1. `python serve.py --no-browser` como servicio (Programador de tareas de Windows o systemd en WSL).
2. `cloudflared tunnel --url http://localhost:8080` (prueba) o un túnel con nombre + dominio propio.
3. Recomendado: Cloudflare Access para que solo vos (o quien autorices) pueda entrar.

> Seguridad: `serve.py` solo sirve `index.html`, `assets/` y `data/`; `config.local.json` nunca se expone
> y la ruta para forzar tareas (`/api/run`) solo responde a pedidos directos desde la misma computadora
> (rechaza los que llegan por un túnel o proxy). Si lo publicás, podés apagarla del todo con `--no-api`.
