/* Monitor Cripto — utilidades: formato, DOM seguro, red, almacenamiento, tiempo. */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const LOCALE = (MC.config && MC.config.locale) || 'es-AR';
  const MINUS = '−';

  // ------------------------------------------------------------- números
  const nf = {};
  function numFmt(min, max) {
    const k = min + ':' + max;
    return nf[k] || (nf[k] = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  function fmtNum(v, max = 2, min = 0) {
    if (!isNum(v)) return '—';
    const s = numFmt(min, max).format(Math.abs(v));
    return (v < 0 ? MINUS : '') + s;
  }
  function priceDecimals(v) {
    const a = Math.abs(v);
    if (a >= 1000) return 0;
    if (a >= 100) return 2;
    if (a >= 0.01) return 4;
    return 6;
  }
  function fmtPrice(v, opts = {}) {
    if (!isNum(v)) return '—';
    const d = opts.decimals ?? priceDecimals(v);
    return (opts.prefix ?? 'US$ ') + fmtNum(v, d, d);
  }
  function fmtCompact(v, opts = {}) {
    if (!isNum(v)) return '—';
    const a = Math.abs(v), sign = v < 0 ? MINUS : '';
    const p = opts.prefix ?? '';
    const d = opts.decimals ?? 1;
    if (a >= 1e12) return sign + p + numFmt(0, 2).format(a / 1e12) + ' B';
    if (a >= 1e9) return sign + p + numFmt(0, d + (a < 1e10 ? 1 : 0)).format(a / 1e9) + ' mil M';
    if (a >= 1e6) return sign + p + numFmt(0, d).format(a / 1e6) + ' M';
    if (a >= 1e4) return sign + p + numFmt(0, d).format(a / 1e3) + ' mil';
    return sign + p + numFmt(0, a < 10 ? 2 : 0).format(a);
  }
  const fmtUSDc = (v, d) => fmtCompact(v, { prefix: 'US$ ', decimals: d });
  function fmtPct(v, opts = {}) {
    if (!isNum(v)) return '—';
    const d = opts.decimals ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
    const sign = v > 0 && opts.sign !== false ? '+' : v < 0 ? MINUS : '';
    return sign + numFmt(d, d).format(Math.abs(v)) + '%';
  }
  function fmtInt(v) { return isNum(v) ? fmtNum(Math.round(v), 0) : '—'; }
  function dirClass(v) { return !isNum(v) || v === 0 ? '' : v > 0 ? 'text-up' : 'text-down'; }
  function arrow(v) { return !isNum(v) || v === 0 ? '' : v > 0 ? '▲' : '▼'; }

  // --------------------------------------------------------------- tiempo
  const dtf = {
    short: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    date: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    day: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }),
  };
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'always', style: 'short' });
  function toMs(t) {
    if (t == null) return null;
    if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
    const ms = Date.parse(t);
    return isNaN(ms) ? null : ms;
  }
  function fmtDate(t, kind = 'short') { const ms = toMs(t); return ms ? dtf[kind].format(new Date(ms)) : '—'; }
  const dtfUTC = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  function fmtDayUTC(t) { const ms = toMs(t); return ms ? dtfUTC.format(new Date(ms)) : '—'; }
  /** Fecha de una señal: velas diarias → día UTC; 4h → fecha y hora local. */
  function fmtSignalTime(s) { return (s.id || '').includes(':1d:') ? fmtDayUTC(s.tEvent) : fmtDate(s.tEvent); }
  function fmtAgo(t, now = Date.now()) {
    const ms = toMs(t);
    if (!ms) return '—';
    const s = (ms - now) / 1000, a = Math.abs(s);
    if (a < 60) return s <= 0 ? 'recién' : 'en segundos';
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400 * 1.5) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 45) return rtf.format(Math.round(s / 86400), 'day');
    if (a < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
    return rtf.format(Math.round(s / (86400 * 365)), 'year');
  }
  function fmtCountdown(ms) {
    if (!isNum(ms)) return '—';
    if (ms <= 0) return 'ahora';
    const m = Math.ceil(ms / 60000);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  /** Lightweight Charts muestra UTC: desplazamos a hora local (recomendado por la librería). */
  function chartTime(ms) {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 1000;
  }

  // ------------------------------------------------------------------ DOM
  /** Crea elementos de forma segura (los textos siempre como textContent). */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v; // solo para íconos/plantillas propias, nunca datos externos
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function safeUrl(u) {
    try { const url = new URL(u, location.href); return /^https?:$/.test(url.protocol) ? url.href : '#'; } catch (e) { return '#'; }
  }

  const ICONS = {
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    spark: '<path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h6v6"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    news: '<path d="M4 22h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    flag: '<path d="M4 22V4a1 1 0 0 1 1-1h11l-2 4 2 4H5"/>',
    cross: '<path d="M4 19 20 5"/><path d="M4 5c6 0 10 4 16 14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };
  function icon(name, cls = 'h-4 w-4') {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls);
    s.innerHTML = ICONS[name] || '';
    return s;
  }

  /** Sparkline SVG (sin interacción; el valor exacto está en el texto al lado). */
  function sparkline(values, opts = {}) {
    const w = opts.width || 240, hgt = opts.height || 44, pad = 2;
    const vals = (values || []).filter(isNum);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', opts.class || 'block h-11 w-full'); svg.setAttribute('aria-hidden', 'true');
    if (vals.length < 2) return svg;
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const x = (i) => pad + (i * (w - pad * 2)) / (vals.length - 1);
    const y = (v) => hgt - pad - ((v - min) / (max - min)) * (hgt - pad * 2);
    let d = '';
    vals.forEach((v, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(2) + ' ' + y(v).toFixed(2); });
    const color = opts.color || 'var(--accent)';
    if (opts.area !== false) {
      const area = document.createElementNS(ns, 'path');
      area.setAttribute('d', d + `L${x(vals.length - 1)} ${hgt}L${x(0)} ${hgt}Z`);
      area.setAttribute('fill', color); area.setAttribute('opacity', '0.10');
      svg.appendChild(area);
    }
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', d); line.setAttribute('fill', 'none'); line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', opts.strokeWidth || 1.8); line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round'); line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(line);
    if (opts.endDot !== false) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x(vals.length - 1)); c.setAttribute('cy', y(vals[vals.length - 1])); c.setAttribute('r', 2.6);
      c.setAttribute('fill', color); c.setAttribute('stroke', 'var(--surface-1)'); c.setAttribute('stroke-width', 1.5);
      svg.appendChild(c);
    }
    return svg;
  }
  /** Mini barras (p. ej. commits semanales). */
  function minibars(values, opts = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const w = opts.width || 240, hgt = opts.height || 36;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', opts.class || 'block h-9 w-full'); svg.setAttribute('aria-hidden', 'true');
    const vals = (values || []).map((v) => (isNum(v) ? v : 0));
    if (!vals.length) return svg;
    const max = Math.max(1, ...vals), gap = 2, bw = Math.max(1, (w - gap * (vals.length - 1)) / vals.length);
    vals.forEach((v, i) => {
      const r = document.createElementNS(ns, 'rect');
      const bh = Math.max(v > 0 ? 1.5 : 0.75, (v / max) * (hgt - 2));
      r.setAttribute('x', (i * (bw + gap)).toFixed(2)); r.setAttribute('y', (hgt - bh).toFixed(2));
      r.setAttribute('width', bw.toFixed(2)); r.setAttribute('height', bh.toFixed(2)); r.setAttribute('rx', Math.min(2, bw / 2));
      r.setAttribute('fill', opts.color || 'var(--accent)'); r.setAttribute('opacity', i >= vals.length - (opts.highlightLast || 0) ? '1' : '0.45');
      svg.appendChild(r);
    });
    return svg;
  }

  // ---------------------------------------------------------------- red
  const hostQueues = {};
  function throttleHost(url, spacing) {
    let host = '';
    try { host = new URL(url).host; } catch (e) { /* noop */ }
    const q = hostQueues[host] || (hostQueues[host] = { last: 0 });
    const wait = Math.max(0, q.last + spacing - Date.now());
    q.last = Date.now() + wait;
    return wait ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
  }
  async function fetchJSON(url, opts = {}) {
    const timeout = opts.timeout || 20000, retries = opts.retries ?? 1;
    if (opts.spacing) await throttleHost(url, opts.spacing);
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl && ctrl.abort(), timeout);
      try {
        const res = await fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: opts.cache || 'no-store' });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, fatal: true });
        return await res.json();
      } catch (e) {
        clearTimeout(timer);
        lastErr = e.name === 'AbortError' ? new Error('tiempo de espera agotado') : e;
        if (e.fatal || attempt === retries) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  // --------------------------------------------------------- almacenamiento
  const storage = {
    get(key, def = null) {
      try { const v = localStorage.getItem('mc:' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem('mc:' + key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    del(key) { try { localStorage.removeItem('mc:' + key); } catch (e) { /* noop */ } },
  };

  function debounce(fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }
  function coin(key) { return MC.config.coins.find((c) => c.key === key) || (MC.config.benchmark.key === key ? MC.config.benchmark : null); }
  function coinColor(key) { const c = coin(key); return c ? cssVar(c.colorVar) : cssVar('--accent'); }

  MC.util = {
    isNum, fmtNum, fmtPrice, fmtCompact, fmtUSDc, fmtPct, fmtInt, priceDecimals, dirClass, arrow,
    toMs, fmtDate, fmtDayUTC, fmtSignalTime, fmtAgo, fmtCountdown, chartTime,
    h, append, clear, $, $$, cssVar, safeUrl, icon, sparkline, minibars,
    fetchJSON, throttleHost, storage, debounce, coin, coinColor, MINUS,
  };
})();
