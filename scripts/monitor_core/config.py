"""Configuración central: monedas, fuentes, frecuencias y rutas."""
from __future__ import annotations

import json
import os
from pathlib import Path

# --------------------------------------------------------------------------
# Rutas
# --------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]          # carpeta del proyecto
DATA_DIR = ROOT / "data"
LOCAL_CONFIG = ROOT / "config.local.json"           # claves opcionales (no se publica)

# --------------------------------------------------------------------------
# Frecuencias (segundos) — coinciden con las instrucciones del proyecto
# --------------------------------------------------------------------------
HOUR = 3600
JOB_INTERVALS = {
    "prices": 1 * HOUR,        # Precios XRP/ADA/ALGO (CoinGecko)
    "candles": 1 * HOUR,       # Velas 4h para análisis técnico (Binance)
    "feargreed": 3 * HOUR,     # Índice de Miedo y Codicia (Alternative.me + CMC)
    "history": 6 * HOUR,       # Historia diaria 1 año + velas 1D
    "fundamentals": 6 * HOUR,  # Fundamentales (CMC, Messari, DefiLlama, GitHub, on-chain, Yahoo, Cryptodaily)
    "official": 12 * HOUR,     # Fuentes oficiales (Ripple, XRPL.org, Cardano, Algorand)
}
JOB_ORDER = ["prices", "candles", "feargreed", "history", "fundamentals", "official"]

# --------------------------------------------------------------------------
# Monedas
# --------------------------------------------------------------------------
COINS = {
    "xrp": {
        "symbol": "XRP",
        "name": "XRP",
        "coingecko": "ripple",
        "binance": "XRPUSDT",
        "cmc_id": 52,
        "cmc_slug": "xrp",
        "messari": "xrp",
        "yahoo": "XRP-USD",
        "llama_chain": "XRPL",          # nombre en /v2/chains y overview
        "llama_stable_chain": "XRPL",
        "keywords": [r"\bXRP\b", r"\bRipple\b", r"\bXRPL\b", r"XRP Ledger", r"\bRLUSD\b"],
        "repos": ["XRPLF/rippled", "XRPLF/xrpl.js", "XRPLF/xrpl-py", "XRPLF/clio"],
    },
    "ada": {
        "symbol": "ADA",
        "name": "Cardano",
        "coingecko": "cardano",
        "binance": "ADAUSDT",
        "cmc_id": 2010,
        "cmc_slug": "cardano",
        "messari": "cardano",
        "yahoo": "ADA-USD",
        "llama_chain": "Cardano",
        "llama_stable_chain": "Cardano",
        "keywords": [r"\bCardano\b", r"\bADA\b", r"Hoskinson", r"Input Output", r"\bIOG\b", r"\bIntersectMBO\b"],
        "repos": ["IntersectMBO/cardano-node", "IntersectMBO/cardano-ledger",
                  "IntersectMBO/ouroboros-consensus", "IntersectMBO/plutus"],
    },
    "algo": {
        "symbol": "ALGO",
        "name": "Algorand",
        "coingecko": "algorand",
        "binance": "ALGOUSDT",
        "cmc_id": 4030,
        "cmc_slug": "algorand",
        "messari": "algorand",
        "yahoo": "ALGO-USD",
        "llama_chain": "Algorand",
        "llama_stable_chain": "Algorand",
        "keywords": [r"\bAlgorand\b", r"\bALGO\b", r"Algo Foundation"],
        "repos": ["algorand/go-algorand", "algorandfoundation/puya",
                  "algorandfoundation/algokit-cli", "algorand/js-algorand-sdk"],
    },
}
BENCHMARK = {"btc": {"symbol": "BTC", "name": "Bitcoin", "coingecko": "bitcoin", "binance": "BTCUSDT"}}

CANDLES_4H_LIMIT = 500   # ~83 días de velas de 4 horas
CANDLES_1D_LIMIT = 400   # ~13 meses de velas diarias

# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------
CG_BASE = "https://api.coingecko.com/api/v3"
CG_PRO_BASE = "https://pro-api.coingecko.com/api/v3"
BINANCE_BASES = ["https://data-api.binance.vision", "https://api.binance.com"]
FNG_URL = "https://api.alternative.me/fng/?limit=400&format=json"
CMC_DATA_API = "https://api.coinmarketcap.com/data-api/v3"
CMC_PRO_API = "https://pro-api.coinmarketcap.com"
MESSARI_ASSETS = "https://api.messari.io/metrics/v2/assets"
LLAMA = "https://api.llama.fi"
LLAMA_STABLES = "https://stablecoins.llama.fi"
GITHUB_API = "https://api.github.com"
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1y&interval=1d"
YAHOO_SEARCH = "https://query1.finance.yahoo.com/v1/finance/search?q={q}&newsCount=10&quotesCount=1"
XRPL_RPC = ["https://xrplcluster.com/", "https://xrpl.ws/"]
XRPSCAN = "https://api.xrpscan.com/api/v1"
KOIOS = "https://api.koios.rest/api/v1"
ALGOD = "https://mainnet-api.4160.nodely.dev"
ALGO_METRICS = "https://afmetrics.api.nodely.io/v1"
ALGO_SUPPLY = "https://metricsapi.algorand.foundation/v1/supply/circulating?unit=algo"

# --------------------------------------------------------------------------
# Fuentes de noticias
# --------------------------------------------------------------------------
OFFICIAL_SOURCES = [
    {"id": "ripple_insights", "coin": "xrp", "name": "Ripple Insights",
     "url": "https://ripple.com/insights/", "kind": "ripple_insights"},
    {"id": "xrpl_blog", "coin": "xrp", "name": "XRPL.org Blog",
     "url": "https://xrpl.org/blog/", "kind": "xrpl_blog"},
    {"id": "cardano_news", "coin": "ada", "name": "Cardano.org",
     "url": "https://cardano.org/news/rss.xml", "kind": "rss"},
    {"id": "algorand_news", "coin": "algo", "name": "Algorand Foundation",
     "url": "https://algorand.co/news/rss.xml", "kind": "rss"},
    {"id": "algorand_blog", "coin": "algo", "name": "Algorand Blog",
     "url": "https://algorand.co/blog/rss.xml", "kind": "rss"},
]
OFFICIAL_SITES = {
    "xrp": "https://ripple.com/xrp/",
    "ada": "https://cardanofoundation.org/",
    "algo": "https://algorand.co/",
}
MEDIA_FEEDS = [
    {"id": "cryptodaily", "name": "Cryptodaily", "url": "https://cryptodaily.co.uk/feed"},
]
YAHOO_NEWS_QUERIES = {"xrp": "XRP", "ada": "Cardano ADA", "algo": "Algorand"}

# Clasificación automática de noticias (título pesa doble).
TAG_RULES = [
    ("Alianza", r"partner|alliance|collaborat|teams? up|integrat|\bjoins?\b|selects|chooses|"
                r"signs|\bMoU\b|memorandum|alianza|acuerdo|se une|integra"),
    ("Regulación", r"\bSEC\b|\bCFTC\b|regulat|legislat|\bbill\b|\bact\b|CLARITY|GENIUS|\bMiCA\b|"
                   r"\bCASP\b|licen[cs]|court|lawsuit|judge|compliance|ruling|regulaci|ley\b"),
    ("Desarrollo", r"upgrade|release|version|\bv\d+\.\d+|mainnet|testnet|devnet|hard ?fork|amendment|"
                   r"protocol|\bnode\b|developer|\bSDK\b|open[- ]source|\bCIP-?\d*|\bXLS-\d+|Leios|Hydra|"
                   r"Plutus|Aiken|AlgoKit|\bAVM\b|smart contract|lending protocol|desarrollo|actualizaci"),
    ("Adopción", r"launch|adopt|payment|stablecoin|RLUSD|USDC|tokeni[sz]|\bRWA\b|real[- ]world|"
                 r"institution|\bbank|treasur|custody|\bETF|\bETP|fund\b|wallet|merchant|remittance|"
                 r"pilot|traceab|lanza|adopci"),
    ("Gobernanza", r"governance|\bvot(e|ing)\b|\bDReps?\b|constitution|proposal|Intersect|xGov|"
                   r"budget|board|council|\bCEO\b|\bCTO\b|appoint|gobernanza"),
    ("Seguridad", r"secur|quantum|post-quantum|\bPQC?\b|Falcon|exploit|hack|vulnerab|audit|"
                  r"disclosure|seguridad|cuántic"),
    ("Mercado", r"price|prediction|analysis|outlook|rally|surge|plunge|\bdrops?\b|bull|bear|whale|\$\d|"
                r"inflow|outflow|market|trading|resistance|support|breakout|forecast|precio"),
    ("Eventos", r"\bevent|summit|conference|hackathon|webinar|\bSwell\b|meetup|academy|course|"
                r"challenge|\bAMA\b|livestream|lineup|evento"),
]
# Categorías propias de los feeds → etiqueta del tablero
FEED_CATEGORY_MAP = {
    "partnerships": "Alianza", "partner news": "Alianza",
    "development": "Desarrollo", "developer": "Desarrollo", "release notes": "Desarrollo",
    "amendments": "Desarrollo", "features": "Desarrollo", "development reports": "Desarrollo",
    "governance": "Gobernanza", "team": "Gobernanza",
    "security": "Seguridad", "advisories": "Seguridad", "quantum": "Seguridad",
    "ecosystem": "Adopción", "use cases": "Adopción", "payments": "Adopción", "stablecoins": "Adopción",
    "defi": "Adopción", "case study": "Adopción", "agentic commerce": "Adopción",
    "community": "Eventos", "hackathon": "Eventos", "events": "Eventos",
    "newsletter": "Mercado",
}

# --------------------------------------------------------------------------
# Claves opcionales (variables de entorno o config.local.json)
# --------------------------------------------------------------------------
_KEY_NAMES = ["COINGECKO_API_KEY", "COINGECKO_PRO", "CMC_API_KEY", "MESSARI_API_KEY",
              "GLASSNODE_API_KEY", "GITHUB_TOKEN"]


def load_keys() -> dict:
    keys = {}
    if LOCAL_CONFIG.exists():
        try:
            keys.update({k: v for k, v in json.loads(LOCAL_CONFIG.read_text("utf-8")).items()
                         if v and not k.startswith("_")})
        except Exception:
            pass
    for name in _KEY_NAMES:
        if os.environ.get(name):
            keys[name] = os.environ[name]
    return keys


KEYS = load_keys()
