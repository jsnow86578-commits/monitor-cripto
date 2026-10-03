/* Monitor Cripto — capa de datos: fuentes en vivo + archivos de los scripts + caché, con programador. */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const { fetchJSON, storage, isNum } = MC.util;
  const cfg = MC.config;
  const I = cfg.intervals;
  const IS_FILE = location.protocol === 'file:';
  const CG = cfg.endpoints.cg;
  const CG_SPACING = 2600;          // separación mínima entre pedidos a CoinGecko desde el navegador
  const CG_HISTORY_SPACING = 12000; // la historia (4 pedidos) se espacia más: la API pública limita por minuto

  const listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, payload) { (listeners[evt] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } }); }

  const coinKeys = cfg.coins.map((c) => c.key);
  const allCoins = cfg.coins.concat([cfg.benchmark]);
  const byCg = Object.fromEntries(allCoins.map((c) => [c.cg, c.key]));

  // ------------------------------------------------------------ fetchers en vivo
  async function livePrices() {
    const ids = allCoins.map((c) => c.cg).join(',');
    const url = `${CG}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=1h,24h,7d,30d,1y&precision=full`;
    // Sin reintentos inmediatos: un 429 de CoinGecko llega sin cabeceras CORS y reintentar lo empeora.
    const markets = await fetchJSON(url, { spacing: CG_SPACING, retries: 0 });
    if (!Array.isArray(markets) || !markets.length) throw new Error('CoinGecko sin datos');
    return { fetched_ts: Date.now(), source: 'coingecko', payload: markets };
  }

  async function binance(path) {
    let err;
    for (const base of cfg.endpoints.binance) {
      try { return await fetchJSON(base + path, { retries: 1, timeout: 15000 }); } catch (e) { err = e; }
    }
    throw err;
  }
  async function liveCandles(interval, limit) {
    const payload = {};
    let source = 'binance';
    const errors = [];
    await Promise.all(cfg.coins.map(async (c) => {
      try {
        const rows = await binance(`/api/v3/klines?symbol=${c.binance}&interval=${interval}&limit=${limit}`);
        payload[c.key] = rows.map((r) => [r[0], +r[1], +r[2], +r[3], +r[4], +r[5]]);
      } catch (e) { errors.push(c.binance + ': ' + e.message); }
    }));
    if (errors.length && interval === '4h') {
      source = Object.keys(payload).length ? 'mixto' : 'coingecko_ohlc';
      for (const c of cfg.coins) {
        if (payload[c.key]) continue;
        const rows = await fetchJSON(`${CG}/coins/${c.cg}/ohlc?vs_currency=usd&days=30`, { spacing: CG_HISTORY_SPACING, retries: 0 });
        payload[c.key] = rows.map((r) => [r[0] - 4 * 3600e3, r[1], r[2], r[3], r[4], null]);
      }
    }
    if (!Object.keys(payload).length) throw new Error(errors.join('; ') || 'sin velas');
    return { fetched_ts: Date.now(), source, interval, format: 'ohlcv', payload };
  }

  async function liveHistory() {
    const payload = {};
    for (const c of allCoins) {
      const d = await fetchJSON(`${CG}/coins/${c.cg}/market_chart?vs_currency=usd&days=365&interval=daily`,
        { spacing: CG_HISTORY_SPACING, retries: 0 });
      payload[c.key] = { prices: d.prices || [], total_volumes: d.total_volumes || [] };
    }
    return { fetched_ts: Date.now(), source: 'coingecko', interval: '1d', payload };
  }

  async function liveFng() {
    const alt = await fetchJSON(cfg.endpoints.fng, { retries: 2 });
    if (!alt || !alt.data || !alt.data.length) throw new Error('Alternative.me sin datos');
    const prev = envs.fng;
    return { fetched_ts: Date.now(), source: 'alternative.me', payload: alt, cmc: prev && prev.cmc };
  }

  // -------------------------------------------------- archivos de los scripts
  let snapPromise = null, snapAt = 0;
  function reloadSnapshot() {
    if (snapPromise && Date.now() - snapAt < 60000) return snapPromise;
    snapAt = Date.now();
    snapPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'data/snapshot.js?v=' + Date.now();
      s.onload = () => { s.remove(); resolve(window.MC_SNAPSHOT || null); };
      s.onerror = () => { s.remove(); resolve(null); };
      document.head.appendChild(s);
    });
    return snapPromise;
  }
  async function loadFile(job) {
    if (IS_FILE) {
      const snap = await reloadSnapshot();
      return normEnv(snap && snap[job.snapKey]);
    }
    try { return normEnv(await fetchJSON(job.file + '?t=' + Date.now(), { retries: 0, timeout: 15000 })); }
    catch (e) { return null; }
  }
  function normEnv(env) {
    if (!env) return null;
    if (!isNum(env.fetched_ts) && env.fetched_at) env.fetched_ts = Date.parse(env.fetched_at);
    if (!isNum(env.fetched_ts) && env.generated_at) env.fetched_ts = Date.parse(env.generated_at);
    return isNum(env.fetched_ts) ? env : null;
  }

  // ------------------------------------------------------------ definición de tareas
  const JOBS = {
    prices: { interval: I.prices, snapKey: 'prices', file: 'data/prices.json', live: livePrices, cache: true, label: 'Precios' },
    fng: { interval: I.fng, snapKey: 'feargreed', file: 'data/fear_greed.json', live: liveFng, cache: true, label: 'Miedo y Codicia' },
    candles4h: { interval: I.candles4h, snapKey: 'candles4h', file: 'data/candles_4h.json', live: () => liveCandles('4h', 500), cache: true, label: 'Velas 4h' },
    status: { interval: I.status, snapKey: 'status', file: 'data/status.json', label: 'Estado de scripts', quiet: true },
    fundamentals: { interval: I.fundamentals, snapKey: 'fundamentals', file: 'data/fundamentals.json', label: 'Fundamentales' },
    official: { interval: I.official, snapKey: 'official', file: 'data/official.json', label: 'Fuentes oficiales' },
    candles1d: { interval: I.candles1d, snapKey: 'candles1d', file: 'data/candles_1d.json', live: () => liveCandles('1d', 400), cache: true, label: 'Velas diarias' },
    // La historia la genera el script cada 6 h; el navegador solo la pide en vivo si el archivo tiene más de 12 h.
    history: { interval: I.history, snapKey: 'history', file: 'data/history.json', live: liveHistory, cache: true, label: 'Historia 1 año', liveFactor: 2 },
  };
  const ORDER = Object.keys(JOBS);

  const envs = {};       // sobre crudo por tarea
  const state = {};      // datos normalizados para la interfaz
  const meta = {};       // estado de cada tarea
  ORDER.forEach((k) => { meta[k] = { ts: null, origin: null, ok: null, error: null, nextAt: 0, loading: false, attempts: 0 }; });

  // ------------------------------------------------------------ normalización
  function normalize(name, env) {
    const p = env.payload;
    switch (name) {
      case 'prices': {
        const coins = {};
        (p || []).forEach((m) => {
          const key = byCg[m.id];
          if (!key) return;
          coins[key] = {
            id: m.id, key, name: m.name, symbol: (m.symbol || '').toUpperCase(), image: m.image,
            price: m.current_price, mcap: m.market_cap, rank: m.market_cap_rank, vol: m.total_volume,
            fdv: m.fully_diluted_valuation, high24: m.high_24h, low24: m.low_24h,
            ch1h: m.price_change_percentage_1h_in_currency, ch24h: m.price_change_percentage_24h_in_currency ?? m.price_change_percentage_24h,
            ch7d: m.price_change_percentage_7d_in_currency, ch30d: m.price_change_percentage_30d_in_currency,
            ch1y: m.price_change_percentage_1y_in_currency, ath: m.ath, athPct: m.ath_change_percentage, athDate: m.ath_date,
            atl: m.atl, atlDate: m.atl_date, circ: m.circulating_supply, total: m.total_supply, max: m.max_supply,
            spark: (m.sparkline_in_7d && m.sparkline_in_7d.price) || [], updated: m.last_updated,
          };
        });
        return { coins, crosscheck: env.crosscheck || null };
      }
      case 'candles4h': case 'candles1d':
        return { source: env.source, series: p || {} };
      case 'history': {
        const series = {};
        Object.entries(p || {}).forEach(([k, v]) => { series[k] = (v.prices || []).filter((r) => isNum(r[1])); });
        return { series };
      }
      case 'fng': {
        const rows = ((p && p.data) || []).map((r) => ({ v: +r.value, label: r.value_classification, t: +r.timestamp * 1000, next: r.time_until_update }));
        rows.sort((a, b) => a.t - b.t);
        const now = rows[rows.length - 1] || null;
        const cmcRows = ((env.cmc && env.cmc.data) || []).map((r) => ({ v: +r.score, label: r.name, t: +r.timestamp * 1000 }))
          .sort((a, b) => a.t - b.t);
        return {
          now, series: rows, nextUpdateAt: now && now.next ? env.fetched_ts + (+now.next) * 1000 : null,
          cmc: { series: cmcRows, now: cmcRows[cmcRows.length - 1] || null, fetched_at: env.cmc && env.cmc.fetched_at },
        };
      }
      default:
        return env;
    }
  }

  function apply(name, env, origin) {
    envs[name] = env;
    state[name] = normalize(name, env);
    state[name].ts = env.fetched_ts;
    state[name].origin = origin;
    meta[name].ts = env.fetched_ts;
    meta[name].origin = origin;
    emit('data', { job: name });
  }

  // ------------------------------------------------------------ ejecución
  function age(env) { return env ? Date.now() - env.fetched_ts : Infinity; }

  async function runJob(name, opts = {}) {
    const job = JOBS[name], m = meta[name];
    if (m.loading) return;
    m.loading = true;
    emit('meta', { job: name });
    try {
      let best = envs[name] || null, origin = m.origin;
      if (!opts.force || !job.live) {
        const fileEnv = await loadFile(job);
        if (fileEnv && (!best || fileEnv.fetched_ts > best.fetched_ts)) { best = fileEnv; origin = IS_FILE ? 'snapshot' : 'archivo'; }
      }
      let liveErr = null;
      if (job.live && (opts.force || age(best) >= job.interval * (job.liveFactor || 1) - 30000)) {
        try {
          const env = await job.live();
          best = env; origin = 'vivo';
          if (job.cache) storage.set('cache:' + name, env);
        } catch (e) { liveErr = e; }
      }
      if (!best) throw liveErr || new Error('sin datos disponibles');
      if (best !== envs[name] || opts.force) apply(name, best, origin);
      m.ok = !liveErr;
      m.error = liveErr ? liveErr.message : null;
      if (liveErr) {
        m.attempts += 1;
        m.nextAt = Date.now() + Math.min(job.interval, cfg.retryBase * Math.pow(2, m.attempts - 1));
      } else {
        m.attempts = 0;
        if (job.live) {
          m.nextAt = best.fetched_ts + job.interval;
          if (m.nextAt < Date.now() + 60000) {
            // Archivo algo viejo pero todavía no corresponde ir en vivo (liveFactor): revisar cada 30 min.
            const liveAt = best.fetched_ts + job.interval * (job.liveFactor || 1);
            m.nextAt = Math.max(Date.now() + 5 * 60000, Math.min(liveAt, Date.now() + 30 * 60000));
          }
        }
        else {
          const expected = best.fetched_ts + job.interval + 3 * 60000;
          m.nextAt = expected > Date.now() ? expected : Date.now() + 30 * 60000;
        }
      }
    } catch (e) {
      m.ok = false; m.error = e.message; m.attempts += 1;
      m.nextAt = Date.now() + Math.min(job.interval, cfg.retryBase * Math.pow(2, m.attempts - 1));
    } finally {
      m.loading = false;
      emit('meta', { job: name });
    }
  }

  let running = false;
  async function runDue() {
    if (running) return;
    running = true;
    try {
      for (const name of ORDER) {
        if (Date.now() >= meta[name].nextAt) await runJob(name);
      }
    } finally { running = false; }
  }

  let lastManual = 0;
  async function refreshNow() {
    if (Date.now() - lastManual < cfg.manualRefreshCooldown) return false;
    lastManual = Date.now();
    for (const name of ['prices', 'fng', 'candles4h']) await runJob(name, { force: true });
    for (const name of ['status', 'fundamentals', 'official']) await runJob(name);
    return true;
  }

  function init() {
    const snap = window.MC_SNAPSHOT || {};
    ORDER.forEach((name) => {
      const job = JOBS[name];
      const cands = [];
      const s = normEnv(snap[job.snapKey]);
      if (s) cands.push([s, IS_FILE ? 'snapshot' : 'archivo']);
      if (job.cache) { const c = normEnv(storage.get('cache:' + name)); if (c) cands.push([c, 'caché']); }
      cands.sort((a, b) => b[0].fetched_ts - a[0].fetched_ts);
      if (cands.length) {
        apply(name, cands[0][0], cands[0][1]);
        const env = cands[0][0];
        meta[name].nextAt = job.live ? env.fetched_ts + job.interval : 0;   // archivos: verificar al iniciar
      }
    });
    runDue();
    setInterval(runDue, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) runDue(); });
    window.addEventListener('online', () => { ORDER.forEach((n) => { if (meta[n].ok === false) meta[n].nextAt = 0; }); runDue(); });
  }

  /** Cotización rápida para alertas (Binance; respaldo CoinGecko). */
  async function quickQuotes() {
    try {
      const symbols = encodeURIComponent(JSON.stringify(cfg.coins.map((c) => c.binance)));
      const rows = await binance(`/api/v3/ticker/price?symbols=${symbols}`);
      const out = {};
      rows.forEach((r) => { const c = cfg.coins.find((x) => x.binance === r.symbol); if (c) out[c.key] = +r.price; });
      return { source: 'Binance', ts: Date.now(), prices: out };
    } catch (e) {
      const ids = cfg.coins.map((c) => c.cg).join(',');
      const d = await fetchJSON(`${CG}/simple/price?ids=${ids}&vs_currencies=usd`, { spacing: CG_SPACING });
      const out = {};
      cfg.coins.forEach((c) => { if (d[c.cg]) out[c.key] = d[c.cg].usd; });
      return { source: 'CoinGecko', ts: Date.now(), prices: out };
    }
  }

  /** ¿Hay un servidor local (serve.py) que permita forzar tareas de los scripts? */
  // Solo tiene sentido con serve.py (localhost o IP de la red local); en GitHub Pages no existe /api.
  const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|\d{1,3}(\.\d{1,3}){3})$/.test(location.hostname);
  async function serverHealth() {
    if (IS_FILE || !LOCAL_HOST) return null;
    try { return await fetchJSON('api/health?t=' + Date.now(), { retries: 0, timeout: 4000 }); } catch (e) { return null; }
  }
  async function serverRun(job) {
    const res = await fetch('api/run?job=' + encodeURIComponent(job), { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  MC.data = { JOBS, ORDER, state, meta, envs, on, emit, init, runJob, runDue, refreshNow, quickQuotes, serverHealth, serverRun, IS_FILE, coinKeys };
})();
