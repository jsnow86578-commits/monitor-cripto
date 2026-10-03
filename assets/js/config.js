/* Monitor Cripto — configuración del tablero. */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const MIN = 60 * 1000, HOUR = 60 * MIN;

  MC.config = {
    version: '1.0.0',
    locale: 'es-AR',

    coins: [
      {
        key: 'xrp', symbol: 'XRP', name: 'XRP', cg: 'ripple', binance: 'XRPUSDT', tv: 'BINANCE:XRPUSDT',
        colorVar: '--c-xrp', official: { label: 'ripple.com/xrp', url: 'https://ripple.com/xrp/' },
        links: {
          coingecko: 'https://www.coingecko.com/es/monedas/xrp',
          coinmarketcap: 'https://coinmarketcap.com/currencies/xrp/',
          messari: 'https://messari.io/project/xrp',
          glassnode: 'https://studio.glassnode.com/',
          yahoo: 'https://finance.yahoo.com/quote/XRP-USD/',
          cryptodaily: 'https://cryptodaily.co.uk/tag/xrp',
          defillama: 'https://defillama.com/chain/XRPL',
          explorer: 'https://xrpscan.com/',
          github: 'https://github.com/XRPLF',
        },
      },
      {
        key: 'ada', symbol: 'ADA', name: 'Cardano', cg: 'cardano', binance: 'ADAUSDT', tv: 'BINANCE:ADAUSDT',
        colorVar: '--c-ada', official: { label: 'cardanofoundation.org', url: 'https://cardanofoundation.org/' },
        links: {
          coingecko: 'https://www.coingecko.com/es/monedas/cardano',
          coinmarketcap: 'https://coinmarketcap.com/currencies/cardano/',
          messari: 'https://messari.io/project/cardano',
          glassnode: 'https://studio.glassnode.com/',
          yahoo: 'https://finance.yahoo.com/quote/ADA-USD/',
          cryptodaily: 'https://cryptodaily.co.uk/tag/cardano',
          defillama: 'https://defillama.com/chain/Cardano',
          explorer: 'https://cardanoscan.io/',
          github: 'https://github.com/IntersectMBO',
        },
      },
      {
        key: 'algo', symbol: 'ALGO', name: 'Algorand', cg: 'algorand', binance: 'ALGOUSDT', tv: 'BINANCE:ALGOUSDT',
        colorVar: '--c-algo', official: { label: 'algorand.co', url: 'https://algorand.co/' },
        links: {
          coingecko: 'https://www.coingecko.com/es/monedas/algorand',
          coinmarketcap: 'https://coinmarketcap.com/currencies/algorand/',
          messari: 'https://messari.io/project/algorand',
          glassnode: 'https://studio.glassnode.com/',
          yahoo: 'https://finance.yahoo.com/quote/ALGO-USD/',
          cryptodaily: 'https://cryptodaily.co.uk/tag/algorand',
          defillama: 'https://defillama.com/chain/Algorand',
          explorer: 'https://allo.info/',
          github: 'https://github.com/algorand',
        },
      },
    ],
    benchmark: { key: 'btc', symbol: 'BTC', name: 'Bitcoin', cg: 'bitcoin', binance: 'BTCUSDT', colorVar: '--c-btc' },

    /* Frecuencias de actualización automática (coinciden con los scripts). */
    intervals: {
      prices: 1 * HOUR,          // Precios XRP/ADA/ALGO — CoinGecko
      candles4h: 1 * HOUR,       // Velas 4h (motor de patrones) — Binance
      fng: 3 * HOUR,             // Índice de Miedo y Codicia — Alternative.me
      history: 6 * HOUR,         // Historia diaria 1 año — CoinGecko
      candles1d: 6 * HOUR,       // Velas diarias (pulso técnico) — Binance
      fundamentals: 6 * HOUR,    // Fundamentales (archivo generado por scripts)
      official: 12 * HOUR,       // Fuentes oficiales (archivo generado por scripts)
      status: 15 * MIN,          // Estado de los scripts
      alertsWatch: 5 * MIN,      // Vigilancia de precio para alertas (solo si hay alertas de precio)
    },
    retryBase: 2 * MIN,
    manualRefreshCooldown: 60 * 1000,

    endpoints: {
      cg: 'https://api.coingecko.com/api/v3',
      binance: ['https://data-api.binance.vision', 'https://api.binance.com'],
      fng: 'https://api.alternative.me/fng/?limit=400&format=json',
    },

    /* Parámetros del motor técnico (4h). */
    ta: { recentBars: 42, rsiLen: 14, pivotsDiv: [5, 5], divRange: [5, 60] },

    news: { pageSize: 14 },
    tags: ['Alianza', 'Desarrollo', 'Regulación', 'Adopción', 'Gobernanza', 'Seguridad', 'Mercado', 'Eventos'],

    /* Directorio de fuentes (sección "Fuentes"). statusKeys → claves de data/status.json */
    sources: [
      { id: 'coingecko', name: 'CoinGecko', what: 'Precios USD, variación 24h/7d/30d, capitalización, volumen, ATH, historia diaria de 1 año y perfil de cada proyecto.', freq: 'Precios cada 1 h · historia cada 6 h', statusKeys: ['coingecko', 'coingecko_history', 'coingecko_profile'], linkKey: 'coingecko', home: 'https://www.coingecko.com/' },
      { id: 'alternative', name: 'Alternative.me', what: 'Índice de Miedo y Codicia (valor, clasificación e historia).', freq: 'Cada 3 h (el índice se publica una vez por día)', statusKeys: ['alternative'], home: 'https://alternative.me/crypto/fear-and-greed-index/' },
      { id: 'binance', name: 'Binance', what: 'Velas de 4 horas y diarias (pares USDT) para el motor de patrones y el pulso técnico; cotización para alertas.', freq: 'Velas 4h cada 1 h · diarias cada 6 h · alertas cada 5 min', statusKeys: ['binance', 'binance_1d'], home: 'https://www.binance.com/es/markets' },
      { id: 'cryptodaily', name: 'Cryptodaily', what: 'Noticias del feed RSS filtradas por XRP, Cardano y Algorand, clasificadas por tema.', freq: 'Cada 6 h', statusKeys: ['cryptodaily'], linkKey: 'cryptodaily', home: 'https://cryptodaily.co.uk/' },
      { id: 'coinmarketcap', name: 'CoinMarketCap', what: 'Ranking, dominancia, rotación, volumen CEX/DEX, watchlists, rango de 52 semanas, auditorías y su propio índice de Miedo y Codicia.', freq: 'Cada 6 h · índice cada 3 h', statusKeys: ['coinmarketcap', 'cmc_fng'], linkKey: 'coinmarketcap', home: 'https://coinmarketcap.com/', note: 'Endpoint público del sitio; con CMC_API_KEY usa la API oficial.' },
      { id: 'messari', name: 'Messari', what: 'Clasificación sectorial y etiquetas de cada activo.', freq: 'Cada 6 h', statusKeys: ['messari'], linkKey: 'messari', home: 'https://messari.io/', note: 'Métricas avanzadas e informes requieren MESSARI_API_KEY.' },
      { id: 'glassnode', name: 'Glassnode', what: 'Métricas on-chain avanzadas (direcciones activas, transacciones).', freq: 'Cada 6 h (si hay clave)', statusKeys: ['glassnode'], linkKey: 'glassnode', home: 'https://glassnode.com/', note: 'Requiere GLASSNODE_API_KEY; la cobertura de XRP/ADA/ALGO es de planes pagos.' },
      { id: 'yahoo', name: 'Yahoo!Finance', what: 'Cotización de referencia para contrastar, rango de 52 semanas y titulares por moneda.', freq: 'Cada 6 h', statusKeys: ['yahoo', 'yahoo_news'], linkKey: 'yahoo', home: 'https://finance.yahoo.com/crypto/' },
      { id: 'defillama', name: 'DefiLlama', what: 'TVL DeFi, stablecoins emitidas en cada red, volumen DEX y comisiones.', freq: 'Cada 6 h', statusKeys: ['defillama'], linkKey: 'defillama', home: 'https://defillama.com/' },
      { id: 'github', name: 'GitHub', what: 'Commits semanales, estrellas y últimos releases de 12 repositorios núcleo.', freq: 'Cada 6 h', statusKeys: ['github'], linkKey: 'github', home: 'https://github.com/' },
      { id: 'networks', name: 'Exploradores de red', what: 'XRPL (xrplcluster + XRPScan), Cardano (Koios) y Algorand (métricas de la Algorand Foundation).', freq: 'Cada 6 h', statusKeys: ['network_xrp', 'network_ada', 'network_algo'], linkKey: 'explorer' },
      { id: 'official', name: 'Canales oficiales', what: 'ripple.com/xrp (escrow), Ripple Insights, XRPL.org Blog, cardano.org (noticias y métricas), Algorand Foundation (noticias y blog).', freq: 'Cada 12 h', statusKeys: ['ripple_xrp', 'ripple_insights', 'xrpl_blog', 'cardano_news', 'cardano_home', 'cardanofoundation', 'algorand_news', 'algorand_blog'], official: true },
    ],
  };
})();
