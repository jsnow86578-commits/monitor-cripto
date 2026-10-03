/* Monitor Cripto — renderizado de secciones. Todo texto externo se inserta como textContent. */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const U = MC.util;
  const { h, clear, $, icon, isNum, fmtPrice, fmtPct, fmtNum, fmtInt, fmtCompact, fmtUSDc, fmtDate, fmtAgo,
    fmtCountdown, dirClass, sparkline, minibars, safeUrl, coin: coinOf, coinColor } = U;
  const cfg = MC.config;
  const D = () => MC.data.state;
  const add = (el, ...kids) => MC.util.append(el, kids);   // ignora null/false

  const FNG_ES = { 'Extreme Fear': 'Miedo extremo', Fear: 'Miedo', Neutral: 'Neutral', Greed: 'Codicia', 'Extreme Greed': 'Codicia extrema' };
  const fngLabel = (s) => FNG_ES[s] || s || '—';
  const fngZoneVar = (v) => (v <= 25 ? '--fg-xfear' : v <= 46 ? '--fg-fear' : v <= 54 ? '--fg-neutral' : v <= 75 ? '--fg-greed' : '--fg-xgreed');
  const fngZoneLabel = (v) => (v <= 25 ? 'Miedo extremo' : v <= 46 ? 'Miedo' : v <= 54 ? 'Neutral' : v <= 75 ? 'Codicia' : 'Codicia extrema');

  // ------------------------------------------------------------ piezas comunes
  function coinBadge(key, size = 'h-9 w-9') {
    const c = coinOf(key);
    const p = D().prices && D().prices.coins[key];
    const el = h('span', { class: `coin-badge ${size}`, style: { background: `var(${c.colorVar})` }, 'aria-hidden': 'true' });
    if (p && p.image) {
      const img = h('img', { src: safeUrl(p.image), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => { img.remove(); el.textContent = c.symbol; });
      add(el, img);
    } else el.textContent = c.symbol;
    return el;
  }
  function deltaChip(v, suffix = '') {
    if (!isNum(v)) return h('span', { class: 'chip', text: '—' });
    return h('span', { class: 'chip ' + (v > 0 ? 'chip-up' : v < 0 ? 'chip-down' : '') },
      h('span', { 'aria-hidden': 'true', text: v > 0 ? '▲' : v < 0 ? '▼' : '' }), fmtPct(v) + suffix);
  }
  function deltaText(v, cls = '') { return h('span', { class: `num ${dirClass(v)} ${cls}`, text: fmtPct(v) }); }
  function kv(k, v, title) {
    const val = v instanceof Node ? v : h('span', { text: v == null ? '—' : String(v) });
    return h('div', { class: 'kv', title: title || null }, h('span', { text: k }), val);
  }
  function srcLine(text, ts, stale) {
    return h('p', { class: 'mt-2 text-[0.68rem] text-ink-3' + (stale ? ' text-warn' : '') },
      text + (ts ? ' · ' + fmtAgo(ts) : '') + (stale ? ' · dato previo (la fuente no respondió)' : ''));
  }
  function strength(score) {
    const label = score >= 66 ? 'Fuerte' : score >= 46 ? 'Media' : 'Débil';
    return h('span', { class: 'inline-flex items-center gap-1.5', title: `Puntaje ${score}/100` },
      h('span', { class: 'bar-track inline-block w-12' }, h('span', { class: 'bar-fill', style: { width: score + '%', background: 'var(--ink-2)' } })),
      h('span', { class: 'text-[0.72rem] text-ink-2', text: label }));
  }
  function statusChip(sig) {
    const cls = { forming: 'chip-warn', confirmed: sig.direction === 'bullish' ? 'chip-up' : 'chip-down', breakout: 'chip-up',
      target: 'chip-accent', invalidated: '', failed: '', active: sig.direction === 'bullish' ? 'chip-up' : 'chip-down' }[sig.status] || '';
    return h('span', { class: 'chip ' + cls, text: sig.statusLabel || sig.status });
  }
  function dirIcon(dir) {
    return h('span', { class: 'inline-grid h-6 w-6 place-items-center rounded-md', style: { background: dir === 'bullish' ? 'var(--up-wash)' : 'var(--down-wash)', color: dir === 'bullish' ? 'var(--up)' : 'var(--down)' } },
      icon(dir === 'bullish' ? 'up' : 'down', 'h-3.5 w-3.5'));
  }
  function emptyState(text) { return h('p', { class: 'py-6 text-center text-[0.82rem] text-ink-3', text }); }

  // ================================================================ encabezado
  const PILL_JOBS = [['prices', 'Precios'], ['fng', 'Sentimiento'], ['candles4h', 'Velas 4h'], ['fundamentals', 'Fundamentales'], ['official', 'Oficiales']];
  function jobHealth(name) {
    const m = MC.data.meta[name], job = MC.data.JOBS[name];
    if (!m || !m.ts) return { color: 'var(--ink-3)', label: 'sin datos' };
    const age = Date.now() - m.ts;
    if (m.ok === false && age > job.interval * 1.5) return { color: 'var(--down-mark)', label: 'error' };
    if (age > job.interval * 2) return { color: 'var(--warn)', label: 'desactualizado' };
    if (m.ok === false) return { color: 'var(--warn)', label: 'respaldo' };
    return { color: 'var(--up-mark)', label: 'ok' };
  }
  function renderStatusPills() {
    const el = $('#status-pills');
    clear(el);
    let worst = 0;
    PILL_JOBS.forEach(([name, label]) => {
      const m = MC.data.meta[name];
      const hl = jobHealth(name);
      if (hl.color.includes('down')) worst = Math.max(worst, 2); else if (hl.color.includes('warn')) worst = Math.max(worst, 1);
      const next = m.nextAt ? m.nextAt - Date.now() : null;
      add(el, h('button', {
        class: 'chip hover:border-line-strong', type: 'button', onclick: openStatus,
        title: `${label}: ${hl.label} · actualizado ${m.ts ? fmtDate(m.ts) : '—'} · próxima ${next != null ? fmtCountdown(next) : '—'}`,
      }, h('span', { class: 'dot', style: { background: hl.color } }), h('span', { class: 'font-semibold text-ink', text: label }),
        h('span', { class: 'num text-ink-3', text: m.loading ? 'actualizando…' : m.ts ? fmtAgo(m.ts) : '—' })));
    });
    const dot = $('#status-dot-mobile');
    if (dot) dot.style.background = worst === 2 ? 'var(--down-mark)' : worst === 1 ? 'var(--warn)' : 'var(--up-mark)';
  }

  function openStatus() { renderStatusDialog(); const d = $('#status-dialog'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  const ORIGIN_ES = { vivo: 'en vivo', archivo: 'archivo de los scripts', snapshot: 'snapshot local', 'caché': 'caché del navegador' };
  async function renderStatusDialog() {
    const body = $('#status-body');
    clear(body);
    const rows = MC.data.ORDER.map((name) => {
      const m = MC.data.meta[name], job = MC.data.JOBS[name], hl = jobHealth(name);
      return h('tr', null,
        h('td', null, h('span', { class: 'inline-flex items-center gap-2' }, h('span', { class: 'dot', style: { background: hl.color } }), job.label)),
        h('td', { class: 'num', text: m.ts ? fmtDate(m.ts) : '—' }),
        h('td', { text: ORIGIN_ES[m.origin] || '—' }),
        h('td', { class: 'num', text: fmtCountdown(job.interval).replace('ahora', '—') }),
        h('td', { class: 'num', text: m.loading ? 'actualizando…' : m.nextAt ? fmtCountdown(m.nextAt - Date.now()) : '—' }),
        h('td', { class: 'max-w-[14rem] truncate text-ink-3', text: m.error || '', title: m.error || '' }));
    });
    add(body, h('h3', { class: 'eyebrow mb-2', text: 'En este navegador' }),
      h('div', { class: 'scroll-x' }, h('table', { class: 'tbl min-w-[640px]' },
        h('thead', null, h('tr', null, ['Dato', 'Actualizado', 'Origen', 'Frecuencia', 'Próxima', 'Detalle'].map((t) => h('th', { text: t })))),
        h('tbody', null, rows))));

    const st = D().status;
    const srcs = (st && st.sources) || {};
    const jobs = (st && st.jobs) || {};
    add(body, h('h3', { class: 'eyebrow mb-2 mt-5', text: 'Scripts de extracción (scripts/monitor.py)' }));
    if (!st) add(body, h('p', { class: 'text-[0.8rem] text-ink-3', text: 'Todavía no hay datos de los scripts. Ejecutá «python serve.py» o «python scripts/monitor.py all».' }));
    else {
      add(body, h('p', { class: 'mb-2 text-[0.78rem] text-ink-2', text: 'Última ejecución: ' + fmtDate(st.generated_at) + ' (' + fmtAgo(st.generated_at) + ').' }));
      const jl = Object.entries(jobs).map(([k, j]) => h('li', { class: 'flex items-center gap-2 text-[0.78rem]' },
        h('span', { class: 'dot', style: { background: j.ok ? 'var(--up-mark)' : 'var(--down-mark)' } }),
        h('span', { class: 'font-medium', text: k }), h('span', { class: 'text-ink-3', text: `· OK ${j.last_ok ? fmtAgo(j.last_ok) : '—'} · próxima ${j.next_due ? fmtAgo(j.next_due) : '—'}` + (j.error ? ' · ' + j.error : '') })));
      add(body, h('ul', { class: 'mb-3 grid gap-1 sm:grid-cols-2' }, jl));
      const sl = Object.entries(srcs).sort((a, b) => (a[1].label || a[0]).localeCompare(b[1].label || b[0])).map(([k, s]) =>
        h('li', { class: 'flex items-start gap-2 text-[0.76rem]' },
          h('span', { class: 'dot mt-1.5', style: { background: s.ok ? 'var(--up-mark)' : s.ok === null ? 'var(--ink-3)' : 'var(--down-mark)' } }),
          h('span', null, h('span', { class: 'font-medium', text: s.label || k }), h('span', { class: 'text-ink-3', text: ' · ' + (s.error || s.note || (s.last_ok ? 'OK ' + fmtAgo(s.last_ok) : '')) }))));
      add(body, h('ul', { class: 'grid gap-1.5 sm:grid-cols-2' }, sl));
    }
    const health = await MC.data.serverHealth();
    if (health && health.ok) {
      const box = h('div', { class: 'mt-5 rounded-xl border border-line bg-surface-2 p-3' },
        h('p', { class: 'text-[0.8rem] text-ink-2', text: `Servidor local activo (serve.py) · programador ${health.scheduler ? 'en marcha' : 'detenido'}. Podés forzar una tarea:` }));
      const btns = h('div', { class: 'mt-2 flex flex-wrap gap-1.5' });
      ['prices', 'candles', 'feargreed', 'history', 'fundamentals', 'official'].forEach((j) => {
        add(btns, h('button', { class: 'btn !py-1 text-[0.74rem]', type: 'button', text: j, onclick: async (e) => {
          e.target.disabled = true; e.target.textContent = j + '…';
          try { await MC.data.serverRun(j); toast({ title: 'Tarea ejecutada', body: j + ': listo. Recargando datos…', tone: 'up' }); MC.data.ORDER.forEach((n) => { MC.data.meta[n].nextAt = 0; }); MC.data.runDue(); }
          catch (err) { toast({ title: 'No se pudo ejecutar', body: String(err.message || err), tone: 'down' }); }
          e.target.disabled = false; e.target.textContent = j;
        } }));
      });
      add(box, btns);
      add(body, box);
    }
  }

  // ================================================================= tarjetas
  function renderCoinCards() {
    const wrap = $('#coin-cards');
    clear(wrap);
    const prices = D().prices;
    cfg.coins.forEach((c) => {
      const p = prices && prices.coins[c.key];
      const an = MC.analysis && MC.analysis.h4[c.key];
      const pu = MC.analysis && MC.analysis.pulse[c.key];
      const card = h('article', { class: 'card card-pad flex flex-col gap-3', 'aria-label': `${c.name} (${c.symbol})` });
      if (!p) { add(card, h('div', { class: 'skeleton h-40' })); add(wrap, card); return; }
      const bias = pu ? pu.biasLabel : null;
      add(card, 
        h('div', { class: 'flex items-center gap-3' }, coinBadge(c.key),
          h('div', { class: 'min-w-0 flex-1' },
            h('div', { class: 'flex items-center gap-2' }, h('h3', { class: 'truncate text-[0.98rem] font-semibold', text: c.name }),
              h('span', { class: 'text-[0.75rem] font-medium text-ink-3', text: c.symbol })),
            h('div', { class: 'text-[0.72rem] text-ink-3', text: `#${p.rank ?? '—'} por capitalización` })),
          bias ? h('span', { class: 'chip ' + (bias === 'Alcista' ? 'chip-up' : bias === 'Bajista' ? 'chip-down' : ''), title: 'Sesgo técnico diario (SMA 50/200 + RSI)', text: bias }) : null),
        h('div', { class: 'flex flex-wrap items-end justify-between gap-2' },
          h('div', { class: 'text-[1.7rem] font-semibold leading-none tracking-tight', text: fmtPrice(p.price) }),
          h('div', { class: 'flex items-center gap-1.5' }, h('span', { class: 'text-[0.7rem] text-ink-3', text: '24 h' }), deltaChip(p.ch24h))),
        h('div', null, sparkline(p.spark, { color: `var(${c.colorVar})` }),
          h('div', { class: 'mt-1 flex justify-between text-[0.68rem] text-ink-3' }, h('span', { text: '7 días' }), h('span', { text: 'ahora' }))),
        h('div', { class: 'grid grid-cols-4 gap-1 text-center' },
          [['1 h', p.ch1h], ['7 d', p.ch7d], ['30 d', p.ch30d], ['1 año', p.ch1y]].map(([k, v]) =>
            h('div', { class: 'rounded-lg bg-surface-2 px-1 py-1.5' }, h('div', { class: 'text-[0.64rem] text-ink-3', text: k }), deltaText(v, 'text-[0.78rem] font-semibold')))),
        h('div', null,
          kv('Capitalización', fmtUSDc(p.mcap)),
          kv('Volumen 24 h', fmtUSDc(p.vol)),
          kv('Rango 24 h', `${fmtPrice(p.low24, { prefix: '' })} – ${fmtPrice(p.high24, { prefix: '' })}`),
          kv('Máximo histórico', h('span', null, fmtPrice(p.ath) + ' ', h('span', { class: dirClass(p.athPct), text: '(' + fmtPct(p.athPct, { decimals: 1 }) + ')' })), p.athDate ? 'ATH del ' + fmtDate(p.athDate, 'date') : '')),
        h('div', { class: 'mt-auto flex flex-wrap items-center gap-1.5' },
          an && isNum(an.rsiNow) ? h('span', { class: 'chip ' + (an.rsiNow >= 70 ? 'chip-down' : an.rsiNow <= 30 ? 'chip-up' : ''), title: 'RSI 14 sobre velas cerradas de 4 h' },
            'RSI 4h ', h('strong', { class: 'num', text: fmtNum(an.rsiNow, 1, 1) })) : null,
          topSignals(c.key, 2).map((s) => h('button', { type: 'button', class: 'chip hover:border-line-strong ' + (s.direction === 'bullish' ? 'chip-up' : 'chip-down'),
            title: 'Ver en el gráfico', onclick: () => MC.app.showSignal(s) }, s.label + ' · ' + s.statusLabel.toLowerCase()))),
        srcLine('CoinGecko', prices.ts));
      add(wrap, card);
    });
  }

  function topSignals(coinKey, n) {
    const an = MC.analysis && MC.analysis.h4[coinKey];
    if (!an) return [];
    const pr = { forming: 3, breakout: 4, confirmed: 4, active: 4, target: 2, invalidated: 0, failed: 0 };
    const seenType = {};
    return an.signals.filter((s) => s.recent && pr[s.status] > 0 && (s.type.startsWith('div') ? s.barsAgo <= 18 : true))
      .sort((a, b) => (pr[b.status] - pr[a.status]) || (b.tEvent - a.tEvent))
      .filter((s) => (seenType[s.type] ? false : (seenType[s.type] = true)))
      .slice(0, n);
  }

  // ======================================================== Miedo y Codicia
  function gauge(value) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 220 134'); svg.setAttribute('class', 'mx-auto block w-full max-w-[260px]');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Índice ${value} de 100: ${fngZoneLabel(value)}`);
    const cx = 110, cy = 112, r = 92, w = 16;
    const ang = (v) => Math.PI * (1 - v / 100);
    const pt = (v, rr) => [cx + rr * Math.cos(ang(v)), cy - rr * Math.sin(ang(v))];
    const zones = [[0, 25, '--fg-xfear'], [25, 46, '--fg-fear'], [46, 54, '--fg-neutral'], [54, 75, '--fg-greed'], [75, 100, '--fg-xgreed']];
    zones.forEach(([a, b, v]) => {
      const [x1, y1] = pt(a + 0.6, r), [x2, y2] = pt(b - 0.6, r);
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`);
      path.setAttribute('fill', 'none'); path.setAttribute('stroke', `var(${v})`); path.setAttribute('stroke-width', w);
      path.setAttribute('opacity', value >= a && value <= b ? '1' : '0.28');
      svg.appendChild(path);
    });
    const [nx, ny] = pt(value, r - 26);
    const needle = document.createElementNS(ns, 'line');
    needle.setAttribute('x1', cx); needle.setAttribute('y1', cy); needle.setAttribute('x2', nx); needle.setAttribute('y2', ny);
    needle.setAttribute('stroke', 'var(--ink-1)'); needle.setAttribute('stroke-width', 3); needle.setAttribute('stroke-linecap', 'round');
    svg.appendChild(needle);
    const hub = document.createElementNS(ns, 'circle');
    hub.setAttribute('cx', cx); hub.setAttribute('cy', cy); hub.setAttribute('r', 6); hub.setAttribute('fill', 'var(--ink-1)');
    hub.setAttribute('stroke', 'var(--surface-1)'); hub.setAttribute('stroke-width', 2);
    svg.appendChild(hub);
    [[0, '0'], [50, '50'], [100, '100']].forEach(([v, t]) => {
      const [tx, ty] = pt(v, r + 0.5);
      const tt = document.createElementNS(ns, 'text');
      tt.setAttribute('x', tx); tt.setAttribute('y', v === 50 ? ty - 13 : ty + 20);
      tt.setAttribute('text-anchor', 'middle');
      tt.setAttribute('font-size', '10'); tt.setAttribute('fill', 'var(--ink-3)'); tt.textContent = t;
      svg.appendChild(tt);
    });
    return svg;
  }
  function renderFng() {
    const el = $('#fng-card');
    clear(el);
    const f = D().fng;
    add(el, h('div', { class: 'flex items-start justify-between gap-2' },
      h('div', null, h('h3', { id: 'fng-title', class: 'text-[0.98rem] font-semibold', text: 'Miedo y Codicia' }),
        h('div', { class: 'text-[0.72rem] text-ink-3', text: 'Sentimiento general del mercado cripto' })),
      h('a', { class: 'link text-[0.72rem]', href: 'https://alternative.me/crypto/fear-and-greed-index/', target: '_blank', rel: 'noopener', text: 'Alternative.me ↗' })));
    if (!f || !f.now) { add(el, h('div', { class: 'skeleton mt-4 h-40' })); return; }
    const v = f.now.v;
    add(el, h('div', { class: 'relative mt-2' }, gauge(v)),
      h('div', { class: '-mt-1 text-center' },
        h('div', { class: 'text-[2.6rem] font-semibold leading-none tracking-tight', text: String(v) }),
        h('div', { class: 'mt-1 inline-flex items-center gap-1.5 text-[0.9rem] font-semibold' },
          h('span', { class: 'dot', style: { background: `var(${fngZoneVar(v)})` } }), fngLabel(f.now.label))));
    const at = (days) => { const t = f.now.t - days * 86400000; let best = null; f.series.forEach((r) => { if (r.t <= t + 3600e3) best = r; }); return best; };
    const cmp = h('div', { class: 'mt-3 grid grid-cols-3 gap-1 text-center' });
    [['Ayer', 1], ['Hace 7 d', 7], ['Hace 30 d', 30]].forEach(([k, d]) => {
      const r = at(d);
      add(cmp, h('div', { class: 'rounded-lg bg-surface-2 px-1 py-1.5' }, h('div', { class: 'text-[0.64rem] text-ink-3', text: k }),
        h('div', { class: 'text-[0.85rem] font-semibold num', text: r ? String(r.v) : '—' }),
        h('div', { class: 'truncate text-[0.62rem] text-ink-3', text: r ? fngLabel(r.label) : '' })));
    });
    add(el, cmp);
    const c = f.cmc && f.cmc.now;
    add(el, h('div', { class: 'mt-3 flex items-center justify-between gap-2 text-[0.76rem]' },
      h('span', { class: 'text-ink-3', text: 'Índice de CoinMarketCap' }),
      c ? h('span', { class: 'inline-flex items-center gap-1.5 font-semibold' }, h('span', { class: 'dot', style: { background: `var(${fngZoneVar(c.v)})` } }), `${c.v} · ${fngLabel(c.label)}`) : h('span', { class: 'text-ink-3', text: 'sin datos' })));
    const next = f.nextUpdateAt ? f.nextUpdateAt - Date.now() : null;
    add(el, h('p', { class: 'mt-auto pt-3 text-[0.68rem] text-ink-3' },
      `El índice se publica una vez por día${next && next > 0 ? ' · próxima publicación en ' + fmtCountdown(next) : ''} · revisamos cada 3 h · ${fmtAgo(f.ts)}`));
  }

  // =============================================================== insights
  function buildInsights() {
    const out = [];
    const st = D();
    const add = (o) => out.push(o);
    cfg.coins.forEach((c) => {
      const p = st.prices && st.prices.coins[c.key];
      if (p) {
        if (isNum(p.ch24h) && Math.abs(p.ch24h) >= 5) add({ score: 55 + Math.abs(p.ch24h), tone: p.ch24h > 0 ? 'up' : 'down', icon: 'spark', coin: c.key,
          title: `${c.symbol} ${p.ch24h > 0 ? 'sube' : 'cae'} ${fmtPct(Math.abs(p.ch24h), { sign: false })} en 24 h`, detail: `Cotiza en ${fmtPrice(p.price)} · volumen ${fmtUSDc(p.vol)}` });
        else if (isNum(p.ch7d) && Math.abs(p.ch7d) >= 12) add({ score: 48 + Math.abs(p.ch7d) / 2, tone: p.ch7d > 0 ? 'up' : 'down', icon: 'spark', coin: c.key,
          title: `${c.symbol} ${fmtPct(p.ch7d)} en 7 días`, detail: `Precio ${fmtPrice(p.price)} · 30 d ${fmtPct(p.ch30d)}` });
      }
      topSignals(c.key, 2).forEach((s) => {
        const conf = ['confirmed', 'breakout', 'active'].includes(s.status);
        let detail = '';
        if (s.type.startsWith('div')) detail = `RSI ${fmtNum(s.rsi1, 1)} → ${fmtNum(s.rsi2, 1)} · precio ${fmtNum(s.price1, 4)} → ${fmtNum(s.price2, 4)}`;
        else if (s.type === 'bull_flag') detail = `Mástil +${fmtNum(s.polePct, 1)}% · retroceso ${fmtNum(s.retracePct, 0)}% · objetivo ${fmtPrice(s.target)}`;
        else detail = `Neckline ${fmtPrice(s.neckline)} · objetivo ${fmtPrice(s.target)}`;
        add({ score: s.score + (conf ? 12 : 4) - Math.min(20, s.barsAgo), tone: s.direction === 'bullish' ? 'up' : 'down', icon: s.type === 'bull_flag' ? 'flag' : s.type.startsWith('div') ? 'pulse' : 'layers',
          coin: c.key, title: `${c.symbol}: ${s.label.toLowerCase()} · ${s.statusLabel.toLowerCase()}`, detail: `${detail} · 4h · ${fmtAgo(s.tEvent)}`, signal: s });
      });
      const pu = MC.analysis && MC.analysis.pulse[c.key];
      if (pu) {
        if (pu.cross && pu.cross.daysAgo <= 14) add({ score: 72 - pu.cross.daysAgo, tone: pu.cross.type === 'golden' ? 'up' : 'down', icon: 'cross', coin: c.key,
          title: `${c.symbol}: cruce ${pu.cross.type === 'golden' ? 'dorado' : 'de la muerte'} (SMA 50/200)`, detail: `${pu.cross.daysAgo === 0 ? 'En la última vela diaria' : 'Hace ' + pu.cross.daysAgo + ' días'} · SMA50 ${fmtNum(pu.sma50, 4)} vs SMA200 ${fmtNum(pu.sma200, 4)}` });
        if (isNum(pu.rsi14) && (pu.rsi14 >= 70 || pu.rsi14 <= 30)) add({ score: 64, tone: pu.rsi14 >= 70 ? 'down' : 'up', icon: 'gauge', coin: c.key,
          title: `${c.symbol}: RSI diario en ${pu.rsi14 >= 70 ? 'sobrecompra' : 'sobreventa'} (${fmtNum(pu.rsi14, 1)})`, detail: 'Zona extrema del RSI de 14 días' });
        else if (isNum(pu.dist200) && Math.abs(pu.dist200) <= 2) add({ score: 46, tone: 'warn', icon: 'gauge', coin: c.key,
          title: `${c.symbol} testea su SMA 200 diaria`, detail: `A ${fmtPct(pu.dist200)} de la media de 200 días (${fmtNum(pu.sma200, 4)})` });
      }
      const fu = st.fundamentals && st.fundamentals.coins && st.fundamentals.coins[c.key];
      if (fu) {
        const df = fu.defi || {};
        if (isNum(df.stablecoins_change_30d) && Math.abs(df.stablecoins_change_30d) >= 20) add({ score: 44, tone: df.stablecoins_change_30d > 0 ? 'up' : 'down', icon: 'users', coin: c.key,
          title: `${c.symbol}: stablecoins en la red ${fmtPct(df.stablecoins_change_30d, { decimals: 0 })} en 30 días`, detail: `${fmtUSDc(df.stablecoins)} emitidos en ${df.chain} · DefiLlama` });
        if (isNum(df.tvl_change_30d) && Math.abs(df.tvl_change_30d) >= 20) add({ score: 42, tone: df.tvl_change_30d > 0 ? 'up' : 'down', icon: 'layers', coin: c.key,
          title: `${c.symbol}: TVL DeFi ${fmtPct(df.tvl_change_30d, { decimals: 0 })} en 30 días`, detail: `${fmtUSDc(df.tvl)} bloqueados · DefiLlama` });
        const dv = fu.dev;
        if (dv && dv.commits_prev_12w > 20) {
          const chg = (dv.commits_12w / dv.commits_prev_12w - 1) * 100;
          if (Math.abs(chg) >= 35) add({ score: 34, tone: chg > 0 ? 'up' : 'down', icon: 'code', coin: c.key,
            title: `${c.symbol}: actividad de desarrollo ${fmtPct(chg, { decimals: 0 })}`, detail: `${fmtInt(dv.commits_12w)} commits en 12 semanas vs ${fmtInt(dv.commits_prev_12w)} en las 12 previas · GitHub` });
        }
        const gov = fu.network && fu.network.governance;
        if (c.key === 'ada' && gov && gov.active_proposals) add({ score: 30, tone: 'warn', icon: 'shield', coin: c.key,
          title: `Cardano: ${gov.active_proposals} propuesta(s) de gobernanza en votación`, detail: Object.entries(gov.types || {}).map(([k, v]) => `${v} ${k}`).join(' · ') });
      }
    });
    const f = st.fng;
    if (f && f.now) {
      const v = f.now.v;
      if (v <= 25 || v >= 76) add({ score: 66, tone: v <= 25 ? 'down' : 'up', icon: 'gauge', title: `Sentimiento en ${fngLabel(f.now.label).toLowerCase()} (${v})`, detail: 'Los extremos del índice suelen coincidir con giros de corto plazo; no es una señal por sí sola.' });
      const wk = f.series.filter((r) => r.t <= f.now.t - 7 * 86400000).pop();
      if (wk && Math.abs(v - wk.v) >= 15) add({ score: 52, tone: v > wk.v ? 'up' : 'down', icon: 'gauge', title: `El sentimiento ${v > wk.v ? 'mejoró' : 'empeoró'} ${Math.abs(v - wk.v)} puntos en una semana`, detail: `De ${wk.v} (${fngLabel(wk.label)}) a ${v} (${fngLabel(f.now.label)})` });
    }
    const off = st.official && st.official.news;
    if (off) {
      off.filter((n) => n.date && Date.now() - Date.parse(n.date) < 72 * 3600e3).slice(0, 2).forEach((n) => add({
        score: 50 - (Date.now() - Date.parse(n.date)) / 3600e3 / 4, tone: 'neutral', icon: 'news', coin: n.coins && n.coins[0],
        title: `Nuevo en ${n.source}: ${n.title}`, detail: (n.tags || []).join(' · ') + ' · ' + fmtAgo(n.date), href: n.url }));
    }
    const corr = MC.analysis && MC.analysis.corr;
    if (corr) {
      const m = corr.matrix, ks = cfg.coins.map((c) => c.key);
      const pairs = [[ks[0], ks[1]], [ks[0], ks[2]], [ks[1], ks[2]]].map(([a, b]) => m[a] && m[a][b]).filter(isNum);
      const avg = pairs.reduce((a, b) => a + b, 0) / (pairs.length || 1);
      if (pairs.length && avg >= 0.8) add({ score: 33, tone: 'warn', icon: 'layers', title: `XRP, ADA y ALGO se mueven casi igual (correlación ${fmtNum(avg, 2, 2)})`, detail: `Retornos diarios de ${corr.days} días: diversificar solo entre estas tres reduce poco el riesgo.` });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  function renderInsights() {
    const list = $('#insights-list');
    clear(list);
    const items = buildInsights().slice(0, 7);
    if (!items.length) { add(list, emptyState('Sin hechos destacados por ahora.')); return; }
    const toneStyle = { up: ['var(--up-wash)', 'var(--up)'], down: ['var(--down-wash)', 'var(--down)'], warn: ['var(--warn-wash)', 'var(--warn)'], neutral: ['var(--accent-wash)', 'var(--link)'] };
    items.forEach((it) => {
      const [bg, fg] = toneStyle[it.tone] || toneStyle.neutral;
      const titleEl = it.href ? h('a', { class: 'font-medium text-ink no-underline hover:underline', href: safeUrl(it.href), target: '_blank', rel: 'noopener', text: it.title })
        : it.signal ? h('button', { type: 'button', class: 'text-left font-medium text-ink hover:underline', text: it.title, onclick: () => MC.app.showSignal(it.signal) })
          : h('span', { class: 'font-medium text-ink', text: it.title });
      add(list, h('div', { class: 'insight' },
        h('span', { class: 'insight-icon', style: { background: bg, color: fg } }, icon(it.icon)),
        h('div', { class: 'min-w-0 text-[0.82rem] leading-snug' }, titleEl, h('div', { class: 'mt-0.5 text-[0.74rem] text-ink-3', text: it.detail || '' }))));
    });
    $('#insights-time').textContent = 'actualizado ' + fmtDate(Date.now(), 'time');
  }

  // =============================================================== radar
  function renderSignalFilters() {
    const el = $('#signals-filters');
    clear(el);
    const v = MC.view;
    const mk = (label, active, onclick) => h('button', { type: 'button', class: 'chip toggle-chip', 'aria-pressed': String(active), text: label, onclick });
    [['all', 'Todas']].concat(cfg.coins.map((c) => [c.key, c.symbol])).forEach(([k, l]) =>
      add(el, mk(l, v.sigCoin === k, () => { v.sigCoin = k; MC.app.saveView(); renderSignalFilters(); renderSignals(); })));
    add(el, h('span', { class: 'mx-1 h-4 w-px bg-line', 'aria-hidden': 'true' }));
    [['all', 'Ambas'], ['bullish', 'Alcistas'], ['bearish', 'Bajistas']].forEach(([k, l]) =>
      add(el, mk(l, v.sigDir === k, () => { v.sigDir = k; MC.app.saveView(); renderSignalFilters(); renderSignals(); })));
  }
  function radarSignals() {
    const v = MC.view;
    const out = [];
    if (!MC.analysis) return out;
    cfg.coins.forEach((c) => {
      if (v.sigCoin !== 'all' && v.sigCoin !== c.key) return;
      const an = MC.analysis.h4[c.key];
      if (!an) return;
      // por moneda y tipo, solo el patrón "en formación" más reciente
      const formingSeen = {};
      an.signals.forEach((s) => {
        if (!s.recent) return;
        if (v.sigDir !== 'all' && s.direction !== v.sigDir) return;
        if (s.status === 'forming') { if (formingSeen[s.type]) return; formingSeen[s.type] = true; }
        out.push(Object.assign({ coin: c.key }, s));
      });
    });
    const pr = { forming: 5, breakout: 6, confirmed: 6, active: 5, target: 3, failed: 1, invalidated: 1 };
    return out.sort((a, b) => (b.tEvent - a.tEvent) || (pr[b.status] - pr[a.status]));
  }
  function renderSignals() {
    const body = $('#signals-body');
    clear(body);
    if (!MC.analysis) { add(body, h('div', { class: 'skeleton h-48' })); return; }
    const sigs = radarSignals();
    if (!sigs.length) { add(body, emptyState('Sin señales en los últimos 7 días con estos filtros.')); return; }
    const level = (s) => (s.type.startsWith('div') ? `RSI ${fmtNum(s.rsi1, 1)}→${fmtNum(s.rsi2, 1)}` : fmtPrice(s.level));
    const target = (s) => (isNum(s.target) ? fmtPrice(s.target) : '—');
    const levelTitle = (s) => (s.type.startsWith('div') ? 'RSI en los dos pivotes' : s.type === 'bull_flag' ? 'Línea superior de la bandera' : 'Neckline');
    const table = h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Moneda', 'Señal', 'Estado', 'Nivel clave', 'Objetivo', 'Evento', 'Fuerza'].map((t, i) => h('th', { class: i >= 3 && i <= 4 ? 'r' : '', text: t })))),
      h('tbody', null, sigs.map((s) => h('tr', { class: 'cursor-pointer', tabindex: '0', title: 'Ver en el gráfico',
        onclick: () => MC.app.showSignal(s), onkeydown: (e) => { if (e.key === 'Enter') MC.app.showSignal(s); } },
        h('td', null, h('span', { class: 'inline-flex items-center gap-2 font-semibold' }, coinBadge(s.coin, 'h-6 w-6'), coinOf(s.coin).symbol)),
        h('td', null, h('span', { class: 'inline-flex items-center gap-2' }, dirIcon(s.direction), h('span', { text: s.label }))),
        h('td', null, statusChip(s)),
        h('td', { class: 'r num whitespace-nowrap', title: levelTitle(s), text: level(s) }),
        h('td', { class: 'r num whitespace-nowrap', text: target(s) }),
        h('td', { class: 'num whitespace-nowrap text-ink-2', title: U.fmtSignalTime(s), text: fmtAgo(s.tEvent) }),
        h('td', null, strength(s.score))))));
    const cards = h('div', { class: 'space-y-2 md:hidden' }, sigs.map((s) => h('button', { type: 'button', class: 'w-full rounded-xl border border-line p-3 text-left',
      onclick: () => MC.app.showSignal(s) },
      h('div', { class: 'flex items-center gap-2' }, coinBadge(s.coin, 'h-6 w-6'), h('span', { class: 'font-semibold', text: coinOf(s.coin).symbol }),
        h('span', { class: 'ml-auto' }, statusChip(s))),
      h('div', { class: 'mt-1.5 flex items-center gap-2 text-[0.84rem]' }, dirIcon(s.direction), h('span', { class: 'min-w-0 flex-1', text: s.label })),
      h('div', { class: 'mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[0.75rem] text-ink-2 num' },
        h('span', { text: s.type.startsWith('div') ? level(s) : `${levelTitle(s)} ${level(s)}` }),
        isNum(s.target) ? h('span', { text: 'Objetivo ' + target(s) }) : null, h('span', { text: fmtAgo(s.tEvent) })))));
    add(body, h('div', { class: 'hidden md:block' }, table), cards,
      h('p', { class: 'mt-2 text-[0.7rem] text-ink-3', text: 'Velas cerradas de Binance (pares USDT). Divergencias con la misma lógica que el indicador «Divergence» de TradingView (pivotes 5/5, rango 5–60 velas): se confirman 5 velas (20 h) después del pivote. Hacé clic en una fila para verla en el gráfico.' }));
  }

  // ============================================================== gráfico
  const LAYERS = [['div', 'Divergencias'], ['double', 'Techos/suelos'], ['flag', 'Banderas'], ['ma', 'SMA 50/200'], ['volume', 'Volumen'], ['history', 'Historial']];
  function renderChartControls() {
    const v = MC.view;
    const coinSeg = $('#chart-coin');
    clear(coinSeg);
    cfg.coins.forEach((c) => add(coinSeg, h('button', { type: 'button', 'aria-pressed': String(v.chartCoin === c.key), text: c.symbol,
      onclick: () => { v.chartCoin = c.key; v.highlight = null; MC.app.saveView(); renderChartControls(); renderChart(true); } })));
    U.$$('#chart-tf button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.tf === v.chartTf)); });
    const ov = $('#chart-overlays');
    clear(ov);
    LAYERS.forEach(([k, l]) => add(ov, h('button', { type: 'button', class: 'chip toggle-chip', 'aria-pressed': String(!!v.layers[k]), text: l,
      onclick: () => { v.layers[k] = !v.layers[k]; MC.app.saveView(); renderChartControls(); renderChart(false); } })));
    const c = coinOf(v.chartCoin);
    $('#chart-tv').href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(c.tv)}&interval=${v.chartTf === '4h' ? '240' : 'D'}`;
  }
  function chartSignals(an) {
    const v = MC.view;
    return an.signals.filter((s) => v.layers.history || s.recent || s.id === v.highlight);
  }
  function renderChart(resetView) {
    const v = MC.view;
    const an = MC.analysis && (v.chartTf === '4h' ? MC.analysis.h4 : MC.analysis.d1)[v.chartCoin];
    const list = $('#chart-signals');
    clear(list);
    if (!an || !an.candles.length || !MC.app.mainChart) { add(list, emptyState('Cargando velas…')); return; }
    const sigs = chartSignals(an);
    MC.app.mainChart.setData({ candles: an.candles, forming: an.forming, analysis: an, signals: sigs, layers: v.layers,
      highlight: v.highlight, tf: v.chartTf, coin: v.chartCoin, resetView: resetView !== false });
    const src = (v.chartTf === '4h' ? D().candles4h : D().candles1d) || {};
    $('#chart-foot').textContent = `${coinOf(v.chartCoin).symbol}/USDT · velas de ${v.chartTf === '4h' ? '4 horas' : '1 día'} · ${src.source === 'binance' ? 'Binance' : src.source === 'coingecko_ohlc' ? 'CoinGecko (respaldo, sin volumen)' : (src.source || '—')} · ` +
      `actualizado ${fmtAgo(src.ts)} · horario local · RSI 14 (Wilder) · la vela en curso no se usa para detectar patrones.`;
    const all = an.signals.slice().sort((a, b) => b.tEvent - a.tEvent);
    const shown = all.filter((s) => v.layers.history || s.recent);
    if (!shown.length) add(list, emptyState(v.layers.history ? 'Sin patrones detectados en este período.' : 'Sin señales en los últimos 7 días. Activá «Historial» para ver anteriores.'));
    shown.slice(0, 14).forEach((s) => {
      const active = v.highlight === s.id;
      add(list, h('button', { type: 'button', class: 'w-full rounded-xl border p-2.5 text-left transition-colors ' + (active ? 'border-line-strong bg-surface-2' : 'border-line hover:bg-surface-2'),
        onclick: () => { v.highlight = active ? null : s.id; renderChart(false); if (!active) MC.app.mainChart.focus(s); } },
        h('div', { class: 'flex items-center gap-2' }, dirIcon(s.direction), h('span', { class: 'min-w-0 flex-1 truncate text-[0.8rem] font-medium', text: s.label }), statusChip(s)),
        h('div', { class: 'mt-1.5 flex justify-between gap-2 text-[0.7rem] text-ink-3 num' },
          h('span', { text: U.fmtSignalTime(s) }),
          h('span', { text: s.type.startsWith('div') ? `RSI ${fmtNum(s.rsi1, 1)}→${fmtNum(s.rsi2, 1)}` : isNum(s.target) ? 'Obj. ' + fmtPrice(s.target) : '' }))));
    });
  }

  // =========================================================== pulso técnico
  function renderPulse() {
    const t = $('#pulse-table');
    clear(t);
    const pul = MC.analysis && MC.analysis.pulse;
    const prices = D().prices;
    if (!pul) { add(t, h('tbody', null, h('tr', null, h('td', null, h('div', { class: 'skeleton h-24' }))))); return; }
    const trendChip = (tr) => tr === 'up' ? h('span', { class: 'chip chip-up', text: 'Alcista' }) : tr === 'down' ? h('span', { class: 'chip chip-down', text: 'Bajista' }) : h('span', { class: 'chip', text: tr ? 'Mixta' : '—' });
    const rsiCell = (r) => !isNum(r) ? '—' : h('span', { class: 'inline-flex items-center gap-1.5' }, h('span', { class: 'num font-semibold', text: fmtNum(r, 1, 1) }),
      r >= 70 ? h('span', { class: 'chip chip-down', text: 'sobrecompra' }) : r <= 30 ? h('span', { class: 'chip chip-up', text: 'sobreventa' }) : null);
    const range = (p) => !isNum(p.pos90) ? '—' : h('div', { class: 'w-28', title: `Mín ${fmtNum(p.lo90, 4)} · Máx ${fmtNum(p.hi90, 4)}` },
      h('div', { class: 'bar-track' }, h('span', { class: 'range-marker', style: { left: `calc(${(p.pos90 * 100).toFixed(1)}% - 1px)` } })),
      h('div', { class: 'mt-1 flex justify-between text-[0.64rem] text-ink-3 num' }, h('span', { text: fmtNum(p.lo90, 4) }), h('span', { text: fmtNum(p.hi90, 4) })));
    add(t, h('thead', null, h('tr', null, ['Moneda', 'Cierre 1D', 'Tendencia', 'vs SMA 50', 'vs SMA 200', 'Cruce 50/200', 'RSI 14D', 'RSI 4h', 'Volat. 30d', 'Rango 90 días', 'vs ATH', 'Sesgo']
      .map((x, i) => h('th', { class: [1, 3, 4, 8, 10].includes(i) ? 'r' : '', text: x })))));
    const tb = h('tbody');
    cfg.coins.forEach((c) => {
      const p = pul[c.key];
      const an = MC.analysis.h4[c.key];
      const pr = prices && prices.coins[c.key];
      if (!p) { add(tb, h('tr', null, h('td', { colspan: '12', class: 'text-ink-3', text: `${c.symbol}: sin velas diarias` }))); return; }
      add(tb, h('tr', null,
        h('td', null, h('span', { class: 'inline-flex items-center gap-2 font-semibold' }, coinBadge(c.key, 'h-6 w-6'), c.symbol)),
        h('td', { class: 'r num', text: fmtNum(p.close, 4, 4) }),
        h('td', null, trendChip(p.trend)),
        h('td', { class: 'r' }, deltaText(p.dist50)),
        h('td', { class: 'r' }, deltaText(p.dist200)),
        h('td', null, p.cross ? h('span', { class: 'inline-flex items-center gap-1.5' }, h('span', { class: 'chip ' + (p.cross.type === 'golden' ? 'chip-up' : 'chip-down'), text: p.cross.type === 'golden' ? 'Dorado' : 'De la muerte' }),
          h('span', { class: 'text-[0.72rem] text-ink-3', text: p.cross.daysAgo === 0 ? 'hoy' : `hace ${p.cross.daysAgo} d` })) : h('span', { class: 'text-ink-3', text: '—' })),
        h('td', null, rsiCell(p.rsi14)),
        h('td', null, rsiCell(an && an.rsiNow)),
        h('td', { class: 'r num', text: isNum(p.vol30) ? fmtNum(p.vol30, 0) + '%' : '—' }),
        h('td', null, range(p)),
        h('td', { class: 'r' }, deltaText(pr && pr.athPct)),
        h('td', null, h('span', { class: 'chip ' + (p.biasLabel === 'Alcista' ? 'chip-up' : p.biasLabel === 'Bajista' ? 'chip-down' : ''), title: `Puntaje ${p.bias} (−4 a +4): precio vs SMA50 y SMA200, SMA50 vs SMA200 y RSI`, text: p.biasLabel }))));
    });
    add(t, tb);
    const src = D().candles1d;
    $('#pulse-time').textContent = src ? 'velas diarias ' + fmtAgo(src.ts) : '';
  }

  // =========================================================== tendencias
  function renderRelative() {
    const hist = D().history;
    if (!hist || !MC.app.relChart) return;
    const rows = MC.app.relChart.setData(hist.series, MC.view.relDays);
    U.$$('#rel-range button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.days === MC.view.relDays)));
    const tbl = $('#rel-table');
    if (!tbl.hidden) {
      clear(tbl);
      const keys = Object.keys(rows);
      const ref = rows[keys[0]] || [];
      const step = Math.max(1, Math.round(ref.length / 12));
      const idx = ref.map((_, i) => i).filter((i) => i % step === 0 || i === ref.length - 1);
      add(tbl, h('table', { class: 'tbl min-w-[520px]' },
        h('thead', null, h('tr', null, h('th', { text: 'Fecha' }), keys.map((k) => h('th', { class: 'r', text: coinOf(k).symbol })))),
        h('tbody', null, idx.map((i) => h('tr', null, h('td', { class: 'num', text: fmtDate(ref[i].time * 1000, 'date') }),
          keys.map((k) => { const pt = rows[k][i]; return h('td', { class: 'r num', text: pt ? fmtNum(pt.value, 1, 1) : '—' }); }))))));
    }
  }
  function renderCorr() {
    const el = $('#corr');
    clear(el);
    const corr = MC.analysis && MC.analysis.corr;
    if (!corr) { add(el, h('div', { class: 'skeleton h-40' })); return; }
    const keys = cfg.coins.map((c) => c.key).concat([cfg.benchmark.key]);
    const cell = (v, same) => {
      if (same) return h('td', { class: 'heat-cell text-ink-3', style: { background: 'var(--surface-2)' }, text: '1' });
      if (!isNum(v)) return h('td', { class: 'heat-cell', text: '—' });
      const a = Math.min(1, Math.abs(v));
      const base = v >= 0 ? MC.charts.alpha(U.cssVar('--accent').startsWith('#') ? U.cssVar('--accent') : '#2a78d6', 0.12 + a * 0.6) : MC.charts.alpha(U.cssVar('--down-mark'), 0.12 + a * 0.6);
      return h('td', { class: 'heat-cell', style: { background: base, color: a > 0.6 ? '#fff' : 'var(--ink-1)' }, title: `Correlación ${fmtNum(v, 2, 2)}`, text: fmtNum(v, 2, 2) });
    };
    add(el, h('table', { class: 'w-full border-separate border-spacing-1 text-[0.8rem]' },
      h('thead', null, h('tr', null, h('th'), keys.map((k) => h('th', { class: 'pb-1 text-center text-[0.72rem] font-semibold text-ink-2', text: coinOf(k).symbol })))),
      h('tbody', null, keys.map((a) => h('tr', null, h('th', { class: 'pr-1 text-left text-[0.72rem] font-semibold text-ink-2', text: coinOf(a).symbol }),
        keys.map((b) => cell(corr.matrix[a] && corr.matrix[a][b], a === b)))))));
    $('#corr-sub').textContent = `Retornos diarios · últimos ${corr.days} días · CoinGecko`;
  }
  function renderFngHistory() {
    const f = D().fng;
    if (!f || !MC.app.fngChart) return;
    MC.app.fngChart.setData(f, MC.view.fngDays);
    U.$$('#fngh-range button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.days === MC.view.fngDays)));
  }

  // =========================================================== fundamentales
  function block(title, iconName, children, src) {
    return h('section', { class: 'border-t border-line pt-3' },
      h('h4', { class: 'eyebrow mb-1.5 flex items-center gap-1.5' }, icon(iconName, 'h-3.5 w-3.5'), title), children, src || null);
  }
  function supplyBar(circ, max) {
    if (!isNum(circ) || !isNum(max) || !max) return null;
    const pct = Math.min(100, (circ / max) * 100);
    return h('div', { class: 'mb-1 mt-0.5' }, h('div', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: pct + '%' } })),
      h('div', { class: 'mt-1 text-[0.68rem] text-ink-3', text: `${fmtNum(pct, 1)}% del suministro máximo en circulación` }));
  }
  function networkBlock(key, n) {
    if (!n) return h('p', { class: 'text-[0.78rem] text-ink-3', text: 'Sin datos de red.' });
    const out = [];
    if (key === 'xrp') {
      const d = n.daily || {};
      out.push(kv('Ledger validado', n.ledger ? '#' + fmtInt(n.ledger) : '—'),
        kv('Transacciones / día', h('span', null, fmtCompact(d.transactions) + ' ', d.tx_avg_30d ? h('span', { class: 'text-ink-3', text: `(prom. 30 d ${fmtCompact(d.tx_avg_30d)})` }) : null)),
        kv('Cuentas activas / día', fmtInt(d.active_accounts), 'Según XRPScan; usuarios activos: ' + fmtInt(d.active_users)),
        kv('Cuentas nuevas / día', fmtInt(d.accounts_created)),
        kv('XRP quemado en comisiones', d.fee_burned_xrp != null ? fmtNum(d.fee_burned_xrp, 0) + ' XRP/día' : '—'),
        kv('TPS (últimos ledgers)', fmtNum(n.tps_now, 1)),
        kv('Validadores en consenso', n.proposers != null ? String(n.proposers) : '—'),
        kv('Pools AMM', fmtInt(n.amm_pools)),
        kv('Reserva de cuenta', n.reserve_base_xrp != null ? `${fmtNum(n.reserve_base_xrp, 2)} XRP + ${fmtNum(n.reserve_inc_xrp, 2)}/objeto` : '—'));
      if (n.series_tx && n.series_tx.length > 5) out.push(h('div', { class: 'mt-2' }, h('div', { class: 'mb-1 text-[0.68rem] text-ink-3', text: 'Transacciones diarias · 90 días' }),
        sparkline(n.series_tx.map((r) => r[1]), { color: `var(--c-xrp)`, height: 36, class: 'block h-9 w-full' })));
    } else if (key === 'ada') {
      out.push(kv('Época', n.epoch ? `${n.epoch}${isNum(n.epoch_progress) ? ' · ' + fmtNum(n.epoch_progress * 100, 0) + '% completada' : ''}` : '—'),
        kv('Altura de bloque', fmtInt(n.block_height)),
        kv('Transacciones última época', n.last_epoch ? fmtInt(n.last_epoch.tx_count) : '—', 'Una época dura 5 días'),
        kv('ADA en staking', isNum(n.stake_ratio) ? `${fmtNum(n.stake_ratio * 100, 1)}% (${fmtCompact(n.active_stake_ada)})` : '—'),
        kv('Stake pools registrados', fmtInt(n.pools)),
        kv('DReps registrados', fmtInt(n.dreps)),
        kv('Propuestas en votación', n.governance ? String(n.governance.active_proposals) : '—'),
        kv('Tesoro on-chain', isNum(n.treasury_ada) ? fmtCompact(n.treasury_ada) + ' ADA' : '—'));
      if (n.series_tx_epoch && n.series_tx_epoch.length > 3) out.push(h('div', { class: 'mt-2' }, h('div', { class: 'mb-1 text-[0.68rem] text-ink-3', text: `Transacciones por época · últimas ${n.series_tx_epoch.length}` }),
        minibars(n.series_tx_epoch.map((r) => r[1]), { color: 'var(--c-ada)', highlightLast: 1 })));
    } else {
      out.push(kv('Estado de la red', n.status ? (n.status === 'UP' ? 'Operativa' : n.status) + (n.forks === 0 ? ' · 0 forks' : '') : '—'),
        kv('Caídas en 365 días', n.downtime_365d_s === 0 ? 'Ninguna' : isNum(n.downtime_365d_s) ? fmtNum(n.downtime_365d_s / 60, 0) + ' min' : '—'),
        kv('Tiempo de bloque', isNum(n.block_time_s) ? fmtNum(n.block_time_s, 2) + ' s' : '—'),
        kv('TPS (1.000 bloques)', fmtNum(n.tps_now, 0)),
        kv('Cuentas activas 24 h', fmtInt(n.active_accounts_24h)),
        kv('Cuentas abiertas', fmtCompact(n.open_accounts)),
        kv('Validadores en línea', fmtInt(n.validators_online)),
        kv('Stake en consenso', isNum(n.online_stake_ratio) ? `${fmtNum(n.online_stake_ratio * 100, 1)}% (${fmtCompact(n.online_stake_algo)} ALGO)` : '—'),
        kv('Rendimiento staking', isNum(n.staking_apy_pct) ? fmtNum(n.staking_apy_pct, 2) + '% APY' : '—'),
        kv('Nodos', fmtInt(n.nodes)));
    }
    return out;
  }
  function renderFundamentals() {
    const grid = $('#fund-grid');
    clear(grid);
    const F = D().fundamentals;
    if (!F || !F.coins) {
      add(grid, h('div', { class: 'card card-pad lg:col-span-3' }, emptyState('Los fundamentales se generan con los scripts (python serve.py o python scripts/monitor.py fundamentals).')));
      return;
    }
    cfg.coins.forEach((c) => {
      const f = F.coins[c.key] || {};
      const pr = D().prices && D().prices.coins[c.key];
      const prof = f.profile || {}, cmc = f.cmc || {}, mes = f.messari || {}, df = f.defi || {}, dev = f.dev, net = f.network, y = f.yahoo || {};
      const mk = prof.market || {};
      const card = h('article', { class: 'card card-pad flex flex-col gap-3' });
      const tags = [];
      if (mes.sector) tags.push(h('span', { class: 'chip chip-accent', title: 'Sector según Messari', text: mes.sector }));
      (prof.categories || []).filter((x) => /quantum|real world|rwa|payments|layer 1|defi|smart contract/i.test(x)).slice(0, 3)
        .forEach((x) => tags.push(h('span', { class: 'chip', title: 'Categoría en CoinGecko', text: x })));
      (mes.tags || []).slice(0, 2).forEach((x) => tags.push(h('span', { class: 'chip', title: 'Etiqueta de Messari', text: x })));
      const seenTag = new Set();
      const uniqTags = tags.filter((t) => { const k = t.textContent.trim().toLowerCase(); return seenTag.has(k) ? false : seenTag.add(k); });
      add(card, h('div', { class: 'flex items-center gap-3' }, coinBadge(c.key),
        h('div', { class: 'min-w-0' }, h('h3', { class: 'text-[0.98rem] font-semibold', text: `${c.name} (${c.symbol})` }),
          h('div', { class: 'text-[0.72rem] text-ink-3', text: [cmc.rank ? `#${cmc.rank} CMC` : null, mes.rank ? `#${mes.rank} Messari` : null].filter(Boolean).join(' · ') }))),
        uniqTags.length ? h('div', { class: 'flex flex-wrap gap-1.5' }, uniqTags) : null,
        prof.description ? h('p', { class: 'text-[0.78rem] leading-relaxed text-ink-2', text: prof.description }) : null);

      add(card, block('Mercado', 'spark', [
        kv('En circulación', isNum(mk.circulating_supply) ? fmtCompact(mk.circulating_supply) + ' ' + c.symbol : '—'),
        supplyBar(mk.circulating_supply, mk.max_supply || mk.total_supply),
        kv('Valuación totalmente diluida', fmtUSDc(mk.fdv)),
        kv('Dominancia del mercado', isNum(cmc.dominance_pct) ? fmtNum(cmc.dominance_pct, 2) + '%' : '—'),
        kv('Rotación (volumen / capitalización)', isNum(cmc.turnover) ? fmtNum(cmc.turnover * 100, 1) + '%' : '—'),
        kv('Volumen en DEX vs CEX', isNum(cmc.cex_volume) ? `${cmc.dex_volume ? fmtUSDc(cmc.dex_volume) : '—'} · ${fmtUSDc(cmc.cex_volume)}` : '—', 'Según CoinMarketCap: volumen en exchanges descentralizados vs centralizados'),
        kv('Watchlists en CMC', cmc.watchlists ? `${fmtCompact(cmc.watchlists)}${cmc.watchlist_rank ? ' (#' + cmc.watchlist_rank + ')' : ''}` : '—', 'Usuarios que siguen la moneda: termómetro de interés'),
        kv('Votos positivos en CoinGecko', isNum(prof.sentiment_up_pct) ? fmtNum(prof.sentiment_up_pct, 0) + '%' : '—'),
        kv('Rango 52 semanas (Yahoo)', isNum(y.low_52w) ? `${fmtNum(y.low_52w, 4)} – ${fmtNum(y.high_52w, 4)}` : '—'),
        kv('En el año (CMC)', isNum(cmc.ytd_change_pct) ? h('span', { class: dirClass(cmc.ytd_change_pct), text: fmtPct(cmc.ytd_change_pct) }) : '—'),
        isNum(y.price) && pr && isNum(pr.price) ? kv('Desvío Yahoo vs CoinGecko', fmtPct((y.price / pr.price - 1) * 100), 'Control de calidad del dato de precio') : null,
      ], srcLine('CoinGecko · CoinMarketCap · Messari · Yahoo Finance', cmc.updated_at, cmc.stale || prof.stale)));

      add(card, block('Adopción · DeFi en la red', 'layers', [
        kv('TVL (valor bloqueado)', h('span', null, fmtUSDc(df.tvl) + ' ', isNum(df.tvl_change_30d) ? h('span', { class: dirClass(df.tvl_change_30d), text: fmtPct(df.tvl_change_30d, { decimals: 1 }) + ' 30 d' }) : null)),
        df.tvl_series && df.tvl_series.length > 5 ? sparkline(df.tvl_series.map((r) => r[1]), { color: `var(${c.colorVar})`, height: 32, class: 'block h-8 w-full my-1' }) : null,
        kv('Stablecoins emitidas', h('span', null, fmtUSDc(df.stablecoins) + ' ', isNum(df.stablecoins_change_30d) ? h('span', { class: dirClass(df.stablecoins_change_30d), text: fmtPct(df.stablecoins_change_30d, { decimals: 1 }) + ' 30 d' }) : null)),
        kv('Volumen DEX 24 h', df.dexs ? h('span', null, fmtUSDc(df.dexs.total24h) + ' ', isNum(df.dexs.change_7d) ? h('span', { class: dirClass(df.dexs.change_7d), title: 'Variación semanal', text: fmtPct(df.dexs.change_7d, { decimals: 0 }) + ' 7 d' }) : null) : '—'),
        kv('Volumen DEX 30 días', df.dexs ? fmtUSDc(df.dexs.total30d) : '—'),
        kv('Comisiones 30 días', df.fees ? fmtUSDc(df.fees.total30d) : '—'),
        df.dexs && df.dexs.top && df.dexs.top.length ? h('p', { class: 'mt-1 text-[0.7rem] text-ink-3', text: 'DEX principales: ' + df.dexs.top.map((t) => `${t.name} (${fmtUSDc(t.vol24h)})`).join(' · ') }) : null,
      ], srcLine('DefiLlama', df.updated_at, df.stale)));

      add(card, block('Red', 'pulse', networkBlock(c.key, net), srcLine(net ? net.source : 'Explorador', net && net.updated_at, net && net.stale)));

      const devBody = [];
      if (dev) {
        const chg = dev.commits_prev_12w ? (dev.commits_12w / dev.commits_prev_12w - 1) * 100 : null;
        devBody.push(kv('Commits últimas 4 semanas', fmtInt(dev.commits_4w)),
          kv('Commits 12 semanas', h('span', null, fmtInt(dev.commits_12w) + ' ', isNum(chg) ? h('span', { class: dirClass(chg), title: 'vs las 12 semanas previas', text: fmtPct(chg, { decimals: 0 }) }) : null)),
          h('div', { class: 'my-1' }, minibars((dev.weekly_commits || []).slice(-26), { color: `var(${c.colorVar})`, highlightLast: 4 }),
            h('div', { class: 'mt-0.5 flex justify-between text-[0.64rem] text-ink-3' }, h('span', { text: 'hace 26 semanas' }), h('span', { text: 'esta semana' }))),
          dev.latest_release ? kv('Último release', h('a', { class: 'link', href: safeUrl(dev.latest_release.url), target: '_blank', rel: 'noopener',
            text: `${dev.latest_release.repo.split('/')[1]} ${dev.latest_release.tag} · ${fmtDate(dev.latest_release.date, 'date')}` })) : null,
          kv('Estrellas (repos seguidos)', fmtCompact(dev.stars)),
          h('p', { class: 'mt-1 text-[0.68rem] text-ink-3', text: 'Repos: ' + (dev.repos || []).map((r) => r.repo.split('/')[1]).join(', ') }));
      } else devBody.push(h('p', { class: 'text-[0.78rem] text-ink-3', text: 'Sin datos de GitHub todavía (se completan al correr los scripts).' }));
      add(card, block('Desarrollo', 'code', devBody, srcLine('GitHub', dev && dev.updated_at, dev && dev.stale)));

      const links = c.links;
      add(card, h('div', { class: 'mt-auto flex flex-wrap gap-1.5 border-t border-line pt-3' },
        [['CoinMarketCap', links.coinmarketcap], ['Messari', links.messari], ['Glassnode', links.glassnode], ['Yahoo Finance', links.yahoo], ['DefiLlama', links.defillama], ['Explorador', links.explorer]]
          .map(([l, u]) => h('a', { class: 'chip hover:border-line-strong no-underline', href: safeUrl(u), target: '_blank', rel: 'noopener', text: l + ' ↗' }))));
      add(grid, card);
    });
    $('#fund-time').textContent = 'generado ' + fmtAgo(F.fetched_at || F.ts);
  }

  // ===================================================== oficiales y noticias
  function renderOfficialCards() {
    const wrap = $('#official-cards');
    clear(wrap);
    const O = D().official, F = D().fundamentals;
    const news = (O && O.news) || [];
    const ot = $('#official-time'); if (ot) ot.textContent = O && O.fetched_at ? 'actualizado ' + fmtAgo(O.fetched_at) : '';
    cfg.coins.forEach((c) => {
      const card = h('article', { class: 'card card-pad flex flex-col gap-2' });
      add(card, h('div', { class: 'flex items-center gap-3' }, coinBadge(c.key, 'h-8 w-8'),
        h('div', { class: 'min-w-0 flex-1' }, h('div', { class: 'eyebrow', text: 'Fuente oficial' }),
          h('a', { class: 'link text-[0.9rem] font-semibold', href: safeUrl(c.official.url), target: '_blank', rel: 'noopener', text: c.official.label + ' ↗' }))));
      const st = O && O.stats && O.stats[c.key];
      if (c.key === 'xrp' && st) {
        const total = (st.held_by_ripple || 0) + (st.distributed || 0);
        add(card, kv('XRP en poder de Ripple', h('span', null, fmtCompact(st.held_by_ripple) + ' ', total ? h('span', { class: 'text-ink-3', text: `(${fmtNum(st.held_by_ripple / total * 100, 1)}%)` }) : null)),
          kv('…de los cuales en escrow', fmtCompact(st.in_escrow)),
          kv('XRP distribuido', fmtCompact(st.distributed)),
          st.headline ? kv('Uso declarado', [st.headline.transactions && st.headline.transactions + ' tx', st.headline.wallets && st.headline.wallets + ' billeteras'].filter(Boolean).join(' · ')) : null,
          h('p', { class: 'text-[0.68rem] text-ink-3', text: `Informe trimestral de Ripple${st.as_of ? ' al ' + fmtDate(st.as_of + 'T12:00:00Z', 'date') : ''} · leído ${fmtAgo(st.updated_at)}` }));
      } else if (c.key === 'ada') {
        add(card, h('p', { class: 'text-[0.74rem] text-ink-3', text: 'cardanofoundation.org bloquea lectores automáticos (verificación anti-bots), por eso sus novedades se toman de cardano.org.' }));
        if (st) add(card, kv('Transacciones en 30 días', fmtInt(st.tx_30d)), kv('Atribuidas a apps destacadas', fmtInt(st.tx_30d_apps)), kv('Apps curadas', fmtInt(st.apps)),
          h('p', { class: 'text-[0.68rem] text-ink-3', text: `cardano.org${st.window_start ? ' · del ' + fmtDate(st.window_start + 'T12:00:00Z', 'day') + ' al ' + fmtDate(st.window_end + 'T12:00:00Z', 'date') : ''} · leído ${fmtAgo(st.updated_at)}` }));
      } else if (c.key === 'algo') {
        const n = F && F.coins && F.coins.algo && F.coins.algo.network;
        if (n) add(card, kv('Disponibilidad 365 días', n.downtime_365d_s === 0 ? '100% · sin caídas' : '—'), kv('Cuentas activas 24 h', fmtInt(n.active_accounts_24h)),
          kv('Validadores en línea', fmtInt(n.validators_online)), kv('Rendimiento staking', isNum(n.staking_apy_pct) ? fmtNum(n.staking_apy_pct, 2) + '% APY' : '—'),
          h('p', { class: 'text-[0.68rem] text-ink-3', text: `Métricas que publica algorand.co (Algorand Foundation) · ${fmtAgo(n.updated_at)}` }));
      }
      const latest = news.filter((n) => n.coins && n.coins[0] === c.key).slice(0, 3);
      if (latest.length) {
        add(card, h('div', { class: 'eyebrow mt-1', text: 'Últimas publicaciones' }));
        latest.forEach((n) => add(card, h('a', { class: 'block rounded-lg px-2 py-1.5 text-[0.8rem] font-medium leading-snug no-underline hover:bg-surface-2', href: safeUrl(n.url), target: '_blank', rel: 'noopener' },
          h('span', { text: n.title }), h('span', { class: 'block text-[0.68rem] font-normal text-ink-3', text: `${n.source} · ${n.date ? fmtAgo(n.date) : 's/f'}` }))));
      }
      add(wrap, card);
    });
  }

  function allNews() {
    const O = D().official, F = D().fundamentals;
    const items = [].concat((O && O.news) || [], (F && F.media_news) || []);
    const seen = new Set();
    return items.filter((n) => { if (!n || seen.has(n.id)) return false; seen.add(n.id); return true; })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  function renderNewsFilters() {
    const v = MC.view.news;
    U.$$('#news-kind button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === v.kind)));
    const coins = $('#news-coins');
    clear(coins);
    [['all', 'Todas']].concat(cfg.coins.map((c) => [c.key, c.symbol])).forEach(([k, l]) => add(coins, h('button', { type: 'button', class: 'chip toggle-chip', 'aria-pressed': String(v.coin === k), text: l,
      onclick: () => { v.coin = k; v.limit = cfg.news.pageSize; MC.app.saveView(); renderNewsFilters(); renderNews(); } })));
    const tags = $('#news-tags');
    clear(tags);
    cfg.tags.forEach((t) => add(tags, h('button', { type: 'button', class: 'chip toggle-chip', 'aria-pressed': String(v.tag === t), text: t,
      onclick: () => { v.tag = v.tag === t ? null : t; v.limit = cfg.news.pageSize; MC.app.saveView(); renderNewsFilters(); renderNews(); } })));
  }
  function renderNews() {
    const v = MC.view.news;
    const list = $('#news-list');
    clear(list);
    let items = allNews();
    const total = items.length;
    items = items.filter((n) => (v.kind === 'all' || n.kind === v.kind) && (v.coin === 'all' || (n.coins || []).includes(v.coin)) && (!v.tag || (n.tags || []).includes(v.tag)));
    if (!total) { add(list, emptyState('Las noticias se generan con los scripts (python serve.py).')); return; }
    if (!items.length) { add(list, emptyState('No hay publicaciones con estos filtros.')); $('#news-more').hidden = true; return; }
    items.slice(0, v.limit).forEach((n) => {
      add(list, h('article', { class: 'news-item' },
        h('div', { class: 'flex flex-wrap items-center gap-1.5 text-[0.7rem] text-ink-3' },
          h('span', { class: 'chip ' + (n.kind === 'oficial' ? 'chip-accent' : ''), text: n.kind === 'oficial' ? 'Oficial' : 'Medio' }),
          h('span', { class: 'font-semibold text-ink-2', text: n.source }), h('span', { text: '·' }),
          h('time', { datetime: n.date || '', title: n.date ? fmtDate(n.date) : '', text: n.date ? fmtAgo(n.date) : 'sin fecha' }),
          (n.coins || []).map((k) => coinOf(k) ? h('span', { class: 'chip', text: coinOf(k).symbol }) : null),
          (n.tags || []).map((t) => h('span', { class: 'chip', text: t })),
          n.stale ? h('span', { class: 'chip chip-warn', text: 'dato previo' }) : null),
        h('a', { class: 'title', href: safeUrl(n.url), target: '_blank', rel: 'noopener', text: n.title }),
        n.summary ? h('p', { class: 'line-clamp-2 text-[0.78rem] text-ink-2', text: n.summary }) : null));
    });
    const more = $('#news-more');
    more.hidden = items.length <= v.limit;
    const O = D().official, F = D().fundamentals;
    $('#news-time').textContent = [O ? 'oficiales ' + fmtAgo(O.fetched_at) : null, F ? 'medios ' + fmtAgo(F.fetched_at) : null].filter(Boolean).join(' · ');
  }

  // ============================================================ directorio
  function renderSources() {
    const grid = $('#sources-grid');
    clear(grid);
    const srcs = (D().status && D().status.sources) || {};
    cfg.sources.forEach((s) => {
      const states = s.statusKeys.map((k) => srcs[k]).filter(Boolean);
      let color = 'var(--ink-3)', label = 'Sin datos aún';
      if (states.length) {
        const ok = states.filter((x) => x.ok === true).length, bad = states.filter((x) => x.ok === false).length, skip = states.filter((x) => x.ok === null).length;
        if (ok && !bad) { color = 'var(--up-mark)'; label = skip ? 'Activa (parcial: ' + skip + ' solo enlace)' : 'Activa'; }
        else if (ok && bad) { color = 'var(--warn)'; label = `Parcial · ${bad} con error`; }
        else if (bad) { color = 'var(--down-mark)'; label = 'Con error'; }
        else { color = 'var(--ink-3)'; label = states[0].note && /api key/i.test(states[0].note) ? 'Requiere API key' : 'Solo enlace'; }
      }
      const lastOk = states.map((x) => x.last_ok).filter(Boolean).sort().pop();
      const errs = states.filter((x) => x.ok === false).map((x) => `${x.label}: ${x.error}`);
      const notes = states.filter((x) => x.ok === null && x.note && !(s.note && /api key/i.test(x.note))).map((x) => x.note);
      const links = s.official ? cfg.coins.map((c) => [c.official.label, c.official.url]) : s.linkKey ? cfg.coins.map((c) => [c.symbol, c.links[s.linkKey]]) : s.home ? [['Sitio', s.home]] : [];
      add(grid, h('article', { class: 'card card-pad flex flex-col gap-2' },
        h('div', { class: 'flex items-center justify-between gap-2' }, h('h3', { class: 'text-[0.92rem] font-semibold', text: s.name }),
          h('span', { class: 'inline-flex items-center gap-1.5 text-[0.72rem] text-ink-2' }, h('span', { class: 'dot', style: { background: color } }), label)),
        h('p', { class: 'text-[0.78rem] text-ink-2', text: s.what }),
        h('p', { class: 'text-[0.72rem] text-ink-3', text: s.freq + (lastOk ? ' · último OK ' + fmtAgo(lastOk) : '') }),
        s.note ? h('p', { class: 'text-[0.7rem] text-ink-3', text: s.note }) : null,
        notes.length ? h('p', { class: 'text-[0.7rem] text-ink-3', text: notes.join(' · ') }) : null,
        errs.length ? h('p', { class: 'text-[0.7rem] text-down', title: errs.join('\n'), text: errs[0].slice(0, 140) }) : null,
        links.length ? h('div', { class: 'mt-auto flex flex-wrap gap-1.5 pt-1' }, links.map(([l, u]) => h('a', { class: 'chip hover:border-line-strong no-underline', href: safeUrl(u), target: '_blank', rel: 'noopener', text: l + ' ↗' }))) : null));
    });
  }

  // ================================================================ varios
  function toast({ title, body, tone = 'accent', timeout = 6000 }) {
    const box = $('#toasts');
    const color = { up: 'var(--up-mark)', down: 'var(--down-mark)', warn: 'var(--warn)', accent: 'var(--accent)' }[tone] || 'var(--accent)';
    const t = h('div', { class: 'toast', role: 'status' },
      h('div', { class: 'flex items-start gap-2' }, h('span', { class: 'dot mt-1.5', style: { background: color } }),
        h('div', { class: 'min-w-0 flex-1' }, h('div', { class: 'font-semibold', text: title }), body ? h('div', { class: 'mt-0.5 text-[0.76rem] text-ink-2', text: body }) : null),
        h('button', { type: 'button', class: 'text-ink-3 hover:text-ink', 'aria-label': 'Cerrar', onclick: () => t.remove() }, icon('x', 'h-3.5 w-3.5'))));
    add(box, t);
    if (timeout) setTimeout(() => t.remove(), timeout);
    while (box.children.length > 4) box.firstChild.remove();
  }
  function banner() {
    const el = $('#banner');
    clear(el);
    const msgs = [];
    if (MC.data.IS_FILE && !U.storage.get('dismiss:file', false)) msgs.push(['file', 'Modo archivo local: precios, sentimiento y velas se actualizan en vivo desde las APIs; fundamentales y noticias muestran el último snapshot. Para que también se actualicen solos, iniciá «python serve.py» (o el lanzador «Iniciar Monitor.bat»).']);
    const F = D().fundamentals;
    if (F && F.ts && Date.now() - F.ts > cfg.intervals.fundamentals * 2.5) msgs.push(['stale', `Los fundamentales tienen ${fmtAgo(F.ts).replace('hace ', '')} de antigüedad: el programador de scripts no parece estar corriendo.`]);
    if (!msgs.length) { el.className = 'hidden'; return; }
    el.className = 'space-y-2';
    msgs.forEach(([k, m]) => add(el, h('div', { class: 'card flex items-start gap-3 px-4 py-3 text-[0.8rem] text-ink-2', role: 'note' },
      h('span', { class: 'insight-icon !h-7 !w-7', style: { background: 'var(--accent-wash)', color: 'var(--link)' } }, icon('info')), h('p', { class: 'flex-1', text: m }),
      k === 'file' ? h('button', { type: 'button', class: 'text-ink-3 hover:text-ink', 'aria-label': 'Ocultar aviso', onclick: () => { U.storage.set('dismiss:file', true); banner(); } }, icon('x', 'h-4 w-4')) : null)));
  }

  MC.ui = {
    renderStatusPills, renderStatusDialog, openStatus, renderCoinCards, renderFng, renderInsights, renderSignalFilters, renderSignals,
    renderChartControls, renderChart, renderPulse, renderRelative, renderCorr, renderFngHistory, renderFundamentals,
    renderOfficialCards, renderNewsFilters, renderNews, renderSources, toast, banner, fngLabel,
  };
})();
