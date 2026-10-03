# Monitor Cripto · XRP · ADA · ALGO

Tablero interactivo para seguir **XRP, Cardano (ADA) y Algorand (ALGO)**: precios, sentimiento, análisis
técnico de 4 horas con detección automática de patrones, alertas, fundamentales reales y canales oficiales.
Funciona en escritorio y celular, se actualiza solo y no necesita instalar dependencias.

---

## Inicio rápido

| Cómo | Qué obtenés |
|---|---|
| **Doble clic en `Iniciar Monitor.bat`** (Windows) | Abre `http://localhost:8080` y deja corriendo el programador: todo se actualiza solo. |
| `python serve.py` (cualquier sistema) | Lo mismo, desde una terminal. `--lan` para verlo desde el celular en tu red. |
| Doble clic en `index.html` | Modo archivo: precios, sentimiento y velas en vivo; fundamentales y noticias del último snapshot. |

Requisito: Python 3.8 o superior (solo biblioteca estándar). El navegador necesita salida a internet.

---

## Qué muestra

- **Tarjetas de precio** (XRP, ADA, ALGO): USD, variación 1 h / 24 h / 7 d / 30 d / 1 año en verde o rojo,
  gráfico de 7 días, capitalización, volumen, rango del día, distancia al máximo histórico, RSI 4h y la señal
  técnica más relevante.
- **Miedo y Codicia**: medidor con el valor y la clasificación en color según el rango
  (0–25 miedo extremo · 26–46 miedo · 47–54 neutral · 55–75 codicia · 76–100 codicia extrema),
  comparación con ayer / 7 / 30 días y el índice de CoinMarketCap para contrastar.
- **Lo más relevante ahora**: hechos destacados generados automáticamente (cruces de medias, señales
  confirmadas, movimientos fuertes, cambios en stablecoins o TVL, novedades oficiales, correlación alta).
- **Radar de señales 4h**: divergencias RSI, dobles techos, dobles suelos y banderas alcistas de los
  últimos 7 días con estado, nivel clave, objetivo medido y fuerza. Un clic lleva al gráfico.
- **Gráfico y patrones**: velas 4H/1D con volumen, RSI, SMA 50/200 y los patrones dibujados
  (líneas de divergencia en precio y RSI, neckline, mástil y canal de la bandera, objetivos).
- **Pulso técnico** (diario): tendencia, distancia a SMA 50/200, cruce dorado / de la muerte, RSI 14 diario
  y 4h, volatilidad anualizada de 30 días, posición en el rango de 90 días y sesgo.
- **Tendencias históricas**: rendimiento relativo (base 100, BTC de referencia), matriz de correlación de
  90 días e historia del sentimiento (Alternative.me vs CoinMarketCap).
- **Fundamentales**: mercado (suministro, FDV, dominancia, rotación, DEX vs CEX, watchlists, rango 52
  semanas), adopción DeFi (TVL, stablecoins, volumen DEX, comisiones), red y desarrollo (commits, releases).
- **Fuentes oficiales y noticias**: datos de ripple.com/xrp (escrow), cardano.org y algorand.co, más
  publicaciones de Ripple Insights, XRPL.org, Cardano.org, Algorand Foundation, Cryptodaily y Yahoo Finance,
  clasificadas por tema (Alianza, Desarrollo, Regulación, Adopción, Gobernanza, Seguridad, Mercado, Eventos).
- **Directorio de fuentes** con estado en vivo de cada integración.
- **Alertas** (campana): precio que cruza un valor, variación 24 h, RSI 4h y nuevas señales técnicas, con
  notificación del navegador, sonido e historial.

## Frecuencias de actualización

| Dato | Frecuencia | Fuente |
|---|---|---|
| Precios XRP, ADA, ALGO | cada **1 hora** | CoinGecko |
| Velas de 4 h (patrones) | cada 1 hora | Binance (pares USDT) |
| Índice de Miedo y Codicia | cada **3 horas** | Alternative.me (+ CoinMarketCap) |
| Historia diaria y velas 1D | cada 6 horas | CoinGecko · Binance |
| Fundamentales | cada **6 horas** | CMC · Messari · DefiLlama · GitHub · redes · Yahoo · Cryptodaily |
| Fuentes oficiales | cada **12 horas** | ripple.com · xrpl.org · cardano.org · algorand.co |
| Vigilancia de alertas de precio | cada 5 minutos (solo con alertas activas) | Binance |

El índice de Alternative.me se publica una vez por día; revisarlo cada 3 h alcanza para no perder la publicación.
El botón **Actualizar** fuerza una consulta en vivo (una vez por minuto como máximo).

## Cómo se detectan los patrones (velas de 4 h)

Se analizan solo velas **cerradas** (la vela en curso se dibuja pero no genera señales).

- **Divergencias RSI** — misma lógica que el indicador *Divergence* incluido en TradingView: RSI 14 de Wilder,
  pivotes del RSI con 5 velas a cada lado, entre 5 y 60 velas entre pivotes.
  *Regular alcista*: precio hace un mínimo menor y el RSI uno mayor. *Regular bajista*: precio máximo mayor y
  RSI máximo menor. *Ocultas*: lo inverso (continuación de tendencia). Se confirman 5 velas (20 h) después del
  pivote, igual que en TradingView, así que podés verificarlas allí con el par BINANCE:XXXUSDT en 4H.
- **Doble techo / doble suelo** — dos pivotes de precio (6/4 velas) separados por 8 a 80 velas, con alturas
  dentro de una tolerancia que depende del ATR (0,8 % a 3 %), un valle/cresta intermedio de al menos 3 % y
  2,5 ATR, y una tendencia previa de al menos el tamaño del patrón. Estados: *en formación*, *confirmado*
  (cierre más allá de la neckline), *objetivo alcanzado* (altura del patrón proyectada), *invalidado* o *fallido*.
- **Bandera alcista** — mástil de 3 a 15 velas con suba ≥ 6 % y ≥ 3,5 ATR, seguido de una consolidación de
  4 a 25 velas lateral o levemente bajista que retrocede como máximo 50 % del mástil. La ruptura se confirma
  con un cierre sobre la línea superior del canal; el objetivo es la ruptura + la altura del mástil.
  Si hay volumen, se valora que caiga durante la bandera.

La **fuerza** (0–100) combina simetría, profundidad, zona del RSI y confirmación. Son detecciones
automáticas: sirven para no perderse nada, no para operar a ciegas.

`npm test` (o `node --test tests/ta.test.js`) corre las pruebas del motor, incluida la verificación del RSI
contra la tabla de referencia de Wilder.

## Scripts de extracción

```bash
python scripts/monitor.py                 # ejecuta solo las tareas vencidas
python scripts/monitor.py all             # fuerza todas
python scripts/monitor.py prices official # tareas puntuales
python scripts/monitor.py --status        # estado de tareas y fuentes
python scripts/monitor.py --loop          # programador sin servidor web
```

Cada tarea escribe un JSON en `data/` y regenera `data/snapshot.js` (lo que permite abrir el tablero con
doble clic). Si una fuente falla, se conserva el último dato válido marcado como "dato previo" y el error queda
registrado en `data/status.json` (visible en el tablero, botón de estado).

### Claves opcionales

Copiá `config.local.example.json` como `config.local.json` (o usá variables de entorno):

| Clave | Para qué |
|---|---|
| `COINGECKO_API_KEY` | Clave Demo gratuita: más margen frente al límite de la API pública. |
| `CMC_API_KEY` | API oficial de CoinMarketCap (sin clave se usa el endpoint público del sitio). |
| `MESSARI_API_KEY` | Métricas avanzadas de Messari (sin clave: clasificación sectorial). |
| `GLASSNODE_API_KEY` | Métricas on-chain de Glassnode (la cobertura de estas monedas es de planes pagos). |
| `GITHUB_TOKEN` | Sube el límite de GitHub de 60 a 5.000 pedidos por hora. |

`config.local.json` nunca se sirve por web ni se sube al repositorio (`.gitignore`).

## Notas sobre las fuentes

- **cardanofoundation.org** tiene una verificación anti-bots (Vercel) que bloquea lectores automáticos: se
  muestra como enlace y las novedades oficiales de Cardano se toman de **cardano.org** (noticias y métricas).
- **ripple.com** no tiene RSS: se leen las tarjetas de *Ripple Insights* y las cifras de escrow de
  *ripple.com/xrp*. Si el sitio cambia de diseño, el estado de la fuente lo va a indicar.
- **Glassnode** requiere clave paga para XRP/ADA/ALGO; queda listado con su enlace.
- La API pública de CoinGecko limita pedidos por minuto; el tablero los espacia y, si recibe un límite, usa el
  último dato disponible y reintenta más tarde.

## Estructura

```
index.html                 tablero
assets/css/app.css         estilos compilados (Tailwind CSS v4)
assets/css/tailwind.input.css  fuente de estilos
assets/js/                 config, utilidades, datos, motor técnico (ta.js), gráficos, alertas, interfaz
assets/vendor/             TradingView Lightweight Charts (Apache 2.0)
data/                      JSON generados por los scripts + snapshot.js
scripts/monitor.py         CLI de extracción · scripts/monitor_core/ (fuentes, tareas, programador)
serve.py                   servidor local + programador
Iniciar Monitor.bat        lanzador para Windows
deploy/                    opciones y plantilla para publicar en internet
tests/                     pruebas del motor técnico
```

Si cambiás clases de Tailwind en el HTML o JS, recompilá el CSS: `npm install` y luego `npm run build:css`.

## Publicación

Ver `deploy/PUBLICAR.md` (GitHub Pages + Actions gratis, Cloudflare Tunnel desde tu VM o un VPS).

---

*Uso informativo. Nada de lo que muestra este tablero es asesoramiento financiero.*
