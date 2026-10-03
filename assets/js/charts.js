/* Monitor Cripto — gráficos (TradingView Lightweight Charts v5). */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const LWC = window.LightweightCharts;
  const { cssVar, chartTime, fmtNum, fmtPct, fmtCompact, priceDecimals, isNum, h, clear, fmtDate } = MC.util;
  const add = (el, ...kids) => MC.util.append(el, kids);   // ignora null/false

  function themeColors() {
    return {
      text: cssVar('--ink-3'), ink: cssVar('--ink-1'), ink2: cssVar('--ink-2'), grid: cssVar('--grid'),
      axis: cssVar('--axis'), border: cssVar('--border'), up: cssVar('--up-mark'), down: cssVar('--down-mark'),
      upText: cssVar('--up'), downText: cssVar('--down'), surface: cssVar('--surface-1'), accent: cssVar('--accent'),
      dark: document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches),
    };
  }
  function chartColor(name) {
    const dark = themeColors().dark;
    const map = {
      rsi: dark ? '#b392f0' : '#6f42c1', sma50: dark ? '#e3b341' : '#a16207', sma200: dark ? '#58a6ff' : '#1c64c4',
    };
    return map[name];
  }
  function alpha(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  function baseOptions(extra = {}) {
    const c = themeColors();
    return Object.assign({
      autoSize: true,
      layout: { background: { type: LWC.ColorType.Solid, color: 'rgba(0,0,0,0)' }, textColor: c.text, fontSize: 11,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', attributionLogo: true,
        panes: { separatorColor: c.border, separatorHoverColor: c.axis } },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: LWC.CrosshairMode.Normal, vertLine: { color: c.axis, labelBackgroundColor: c.ink2 },
        horzLine: { color: c.axis, labelBackgroundColor: c.ink2 } },
      localization: { locale: 'es-AR' },
    }, extra);
  }
  const lineOpts = (color, width = 2, extra = {}) => Object.assign({
    color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
  }, extra);

  // =================================================================== principal
  function createMain(container, legendEl) {
    const chart = LWC.createChart(container, baseOptions());
    let decimals = 4;
    const priceFmt = (v) => fmtNum(v, decimals, decimals);

    const c0 = themeColors();
    const candles = chart.addSeries(LWC.CandlestickSeries, {
      upColor: c0.up, downColor: c0.down, wickUpColor: c0.up, wickDownColor: c0.down, borderVisible: false,
      priceLineVisible: true, priceLineStyle: LWC.LineStyle.Dotted,
    });
    const volume = chart.addSeries(LWC.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol',
      lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const sma50 = chart.addSeries(LWC.LineSeries, lineOpts(chartColor('sma50'), 1.5));
    const sma200 = chart.addSeries(LWC.LineSeries, lineOpts(chartColor('sma200'), 1.5));
    const rsi = chart.addSeries(LWC.LineSeries, lineOpts(chartColor('rsi'), 1.6, {
      lastValueVisible: true, crosshairMarkerVisible: true,
      priceFormat: { type: 'custom', formatter: (v) => fmtNum(v, 1, 1), minMove: 0.1 },
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    }), 1);
    const lvl = (p, title) => rsi.createPriceLine({ price: p, color: themeColors().axis, lineWidth: 1,
      lineStyle: LWC.LineStyle.Solid, axisLabelVisible: false, title });
    const rsiLines = [lvl(70, '70'), lvl(30, '30'), lvl(50, '')];
    rsi.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
    chart.panes()[0].setStretchFactor(3);
    chart.panes()[1].setStretchFactor(1);
    const markersMain = LWC.createSeriesMarkers(candles, []);
    const markersRsi = LWC.createSeriesMarkers(rsi, []);

    let overlays = [];
    let current = null;     // { candles, analysis, tf, coin }
    let toT = chartTime;    // 4h: hora local · 1D: fecha UTC (la vela diaria abre 00:00 UTC)

    function clearOverlays() { overlays.forEach((s) => chart.removeSeries(s)); overlays = []; }
    function addLine(points, color, width, style, pane = 0) {
      const pts = points.filter((p) => isNum(p.value)).sort((a, b) => a.time - b.time);
      const uniq = pts.filter((p, i) => i === 0 || p.time !== pts[i - 1].time);
      if (uniq.length < 2) return;
      const s = chart.addSeries(LWC.LineSeries, lineOpts(color, width, { lineStyle: style || LWC.LineStyle.Solid,
        priceFormat: { type: 'custom', formatter: priceFmt } }), pane);
      s.setData(uniq);
      overlays.push(s);
    }

    function drawSignals(signals, opts) {
      clearOverlays();
      const c = themeColors();
      const ms = [], mr = [];
      const cs = current.candles;
      const tOf = (i) => toT(cs[Math.max(0, Math.min(cs.length - 1, i))][0]);
      const lastI = cs.length - 1;
      signals.forEach((s) => {
        const col = s.direction === 'bullish' ? c.up : c.down;
        const hl = opts.highlight === s.id;
        const w = hl ? 3 : 2;
        if (s.type.startsWith('div')) {
          if (!opts.layers.div) return;
          const style = s.kind === 'hidden' ? LWC.LineStyle.Dashed : LWC.LineStyle.Solid;
          addLine([{ time: tOf(s.i1), value: s.price1 }, { time: tOf(s.i2), value: s.price2 }], col, w, style);
          addLine([{ time: tOf(s.i1), value: s.rsi1 }, { time: tOf(s.i2), value: s.rsi2 }], col, w, style, 1);
          const bull = s.direction === 'bullish';
          ms.push({ time: tOf(s.i2), position: bull ? 'belowBar' : 'aboveBar', shape: bull ? 'arrowUp' : 'arrowDown',
            color: col, text: s.kind === 'hidden' ? 'Div. oculta' : 'Div.', size: hl ? 1.4 : 1 });
          mr.push({ time: tOf(s.i2), position: bull ? 'belowBar' : 'aboveBar', shape: 'circle', color: col, size: 0.6 });
        } else if (s.type === 'double_top' || s.type === 'double_bottom') {
          if (!opts.layers.double) return;
          const top = s.type === 'double_top';
          const endI = s.endIdx ?? (s.breakIdx != null ? Math.min(lastI, s.breakIdx + 8) : lastI);
          addLine([{ time: tOf(s.p1), value: s.neckline }, { time: tOf(endI), value: s.neckline }], c.text, hl ? 2 : 1.5, LWC.LineStyle.Dashed);
          ms.push({ time: tOf(s.p1), position: top ? 'aboveBar' : 'belowBar', shape: 'circle', color: col, text: top ? 'T1' : 'S1', size: hl ? 1.2 : 0.9 });
          ms.push({ time: tOf(s.p2), position: top ? 'aboveBar' : 'belowBar', shape: 'circle', color: col, text: top ? 'T2' : 'S2', size: hl ? 1.2 : 0.9 });
          if (s.breakIdx != null) {
            ms.push({ time: tOf(s.breakIdx), position: top ? 'aboveBar' : 'belowBar', shape: top ? 'arrowDown' : 'arrowUp', color: col, text: 'Ruptura' });
            addLine([{ time: tOf(s.breakIdx), value: s.target }, { time: tOf(Math.min(lastI, Math.max(endI, s.breakIdx + 6))), value: s.target }], col, 1.5, LWC.LineStyle.Dotted);
          }
        } else if (s.type === 'bull_flag') {
          if (!opts.layers.flag) return;
          addLine([{ time: tOf(s.base), value: s.poleLow }, { time: tOf(s.top), value: s.poleHigh }], col, hl ? 4 : 3);
          addLine([{ time: tOf(s.upper.i1), value: s.upper.v1 }, { time: tOf(s.upper.i2), value: s.upper.v2 }], col, hl ? 2 : 1.5);
          addLine([{ time: tOf(s.lower.i1), value: s.lower.v1 }, { time: tOf(s.lower.i2), value: s.lower.v2 }], col, hl ? 2 : 1.5);
          ms.push({ time: tOf(s.top), position: 'aboveBar', shape: 'circle', color: col, text: 'Bandera', size: hl ? 1.2 : 0.9 });
          if (s.breakIdx != null) {
            ms.push({ time: tOf(s.breakIdx), position: 'belowBar', shape: 'arrowUp', color: col, text: 'Ruptura' });
            addLine([{ time: tOf(s.breakIdx), value: s.target }, { time: tOf(Math.min(lastI, s.breakIdx + 8)), value: s.target }], col, 1.5, LWC.LineStyle.Dotted);
          }
        }
      });
      const sortT = (a, b) => a.time - b.time;
      markersMain.setMarkers(ms.sort(sortT));
      markersRsi.setMarkers(mr.sort(sortT));
    }

    function setData(d) {
      current = d;
      toT = d.tf === '1d' ? (ms) => Math.floor(ms / 1000) : chartTime;
      chart.applyOptions({ timeScale: { timeVisible: d.tf !== '1d' } });
      const cs = d.candles;
      if (!cs || !cs.length) return;
      decimals = priceDecimals(cs[cs.length - 1][4]);
      candles.applyOptions({ priceFormat: { type: 'custom', formatter: priceFmt, minMove: Math.pow(10, -decimals) } });
      const all = cs.concat(d.forming ? [d.forming] : []);
      candles.setData(all.map((c) => ({ time: toT(c[0]), open: c[1], high: c[2], low: c[3], close: c[4] })));
      const c = themeColors();
      volume.setData(all.map((c2) => ({ time: toT(c2[0]), value: isNum(c2[5]) ? c2[5] : 0,
        color: c2[4] >= c2[1] ? alpha(c.up, 0.32) : alpha(c.down, 0.32) })));
      volume.applyOptions({ visible: !!d.layers.volume && all.some((c2) => isNum(c2[5])) });
      const closes = cs.map((x) => x[4]);
      const s50 = MC.TA.sma(closes, 50), s200 = MC.TA.sma(closes, 200);
      const toLine = (arr) => arr.map((v, i) => (v == null ? null : { time: toT(cs[i][0]), value: v })).filter(Boolean);
      sma50.setData(d.layers.ma ? toLine(s50) : []);
      sma200.setData(d.layers.ma ? toLine(s200) : []);
      rsi.setData(d.analysis.rsi.map((v, i) => (v == null ? null : { time: toT(cs[i][0]), value: v })).filter(Boolean));
      drawSignals(d.signals, { layers: d.layers, highlight: d.highlight });
      if (d.resetView) {
        const n = all.length, show = d.tf === '1d' ? 180 : 150;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - show), to: n + 3 });
      }
      updateLegend(null);
    }

    function updateLegend(param) {
      if (!legendEl || !current) return;
      const cs = current.candles.concat(current.forming ? [current.forming] : []);
      let idx = cs.length - 1;
      if (param && param.time != null) {
        const t = param.time;
        const k = cs.findIndex((c) => toT(c[0]) === t);
        if (k >= 0) idx = k;
      }
      const c = cs[idx];
      if (!c) return;
      const prev = cs[idx - 1];
      const ch = prev ? (c[4] / prev[4] - 1) * 100 : null;
      const r = idx < current.candles.length ? current.analysis.rsi[idx] : null;
      clear(legendEl);
      const item = (k, v, cls) => h('span', null, h('span', { class: 'text-ink-3', text: k + ' ' }), h('span', { class: cls || 'text-ink', text: v }));
      add(legendEl, 
        h('span', { class: 'font-semibold text-ink', text: (current.tf === '1d' ? MC.util.fmtDayUTC(c[0]) : fmtDate(c[0])) + (idx === cs.length - 1 && current.forming ? ' · en curso' : '') }),
        item('A', fmtNum(c[1], decimals, decimals)), item('Máx', fmtNum(c[2], decimals, decimals)),
        item('Mín', fmtNum(c[3], decimals, decimals)), item('C', fmtNum(c[4], decimals, decimals)),
        item('Var', fmtPct(ch), ch > 0 ? 'text-up' : ch < 0 ? 'text-down' : 'text-ink'),
        isNum(c[5]) ? item('Vol', fmtCompact(c[5])) : null,
        r != null ? h('span', null, h('span', { class: 'legend-key mr-1', style: { background: chartColor('rsi') } }), h('span', { class: 'text-ink-3', text: 'RSI ' }), h('span', { class: 'text-ink', text: fmtNum(r, 1, 1) })) : null,
        current.layers.ma ? h('span', null, h('span', { class: 'legend-key mr-1', style: { background: chartColor('sma50') } }), h('span', { class: 'text-ink-3', text: 'SMA 50' })) : null,
        current.layers.ma ? h('span', null, h('span', { class: 'legend-key mr-1', style: { background: chartColor('sma200') } }), h('span', { class: 'text-ink-3', text: 'SMA 200' })) : null,
      );
    }
    chart.subscribeCrosshairMove(updateLegend);

    function focus(sig) {
      if (!current || !sig) return;
      const n = current.candles.length;
      const a = Math.max(0, (sig.i1 ?? sig.p1 ?? sig.base ?? sig.eventIdx) - 25);
      const b = Math.min(n + 3, (sig.endIdx ?? sig.breakIdx ?? sig.eventIdx ?? n) + 25);
      chart.timeScale().setVisibleLogicalRange({ from: a, to: Math.max(b, a + 60) });
    }

    function applyTheme() {
      chart.applyOptions(baseOptions());
      const c = themeColors();
      candles.applyOptions({ upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down });
      sma50.applyOptions({ color: chartColor('sma50') });
      sma200.applyOptions({ color: chartColor('sma200') });
      rsi.applyOptions({ color: chartColor('rsi') });
      rsiLines.forEach((l) => l.applyOptions({ color: c.axis }));
      if (current) setData(Object.assign({}, current, { resetView: false }));
    }

    return { chart, setData, focus, applyTheme };
  }

  // ========================================================= rendimiento relativo
  function createRelative(container, legendEl) {
    const chart = LWC.createChart(container, baseOptions({
      localization: { locale: 'es-AR', priceFormatter: (v) => fmtNum(v, 1, 1) },
      timeScale: { borderColor: themeColors().border, timeVisible: false, rightOffset: 2 },
      handleScroll: false, handleScale: false,
    }));
    const keys = MC.config.coins.map((c) => c.key).concat([MC.config.benchmark.key]);
    const series = {};
    keys.forEach((k) => {
      const isB = k === MC.config.benchmark.key;
      series[k] = chart.addSeries(LWC.LineSeries, lineOpts(MC.util.coinColor(k), isB ? 1.5 : 2,
        { lastValueVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4 }));
    });
    series[keys[0]].createPriceLine({ price: 100, color: themeColors().axis, lineWidth: 1, lineStyle: LWC.LineStyle.Solid, axisLabelVisible: false });
    let last = null;

    function setData(hist, days) {
      last = { hist, days };
      const rows = {};
      const cut = Date.now() - days * 86400000;
      keys.forEach((k) => {
        const arr = (hist[k] || []).filter((r) => r[0] >= cut);
        if (!arr.length) { series[k].setData([]); return; }
        const base = arr[0][1];
        // un punto por día (la API agrega el valor "actual" como último punto)
        const byDay = new Map();
        arr.forEach((r) => byDay.set(Math.floor(r[0] / 86400000), r));
        const pts = Array.from(byDay.values()).map((r) => ({ time: Math.floor(r[0] / 86400000) * 86400, value: (r[1] / base) * 100 }));
        series[k].setData(pts);
        rows[k] = pts;
      });
      chart.timeScale().fitContent();
      renderLegend(null);
      return rows;
    }
    function renderLegend(param) {
      if (!legendEl || !last) return;
      clear(legendEl);
      keys.forEach((k) => {
        const c = MC.util.coin(k);
        let v = null;
        if (param && param.seriesData && param.seriesData.get(series[k])) v = param.seriesData.get(series[k]).value;
        else { const d = series[k].data(); v = d.length ? d[d.length - 1].value : null; }
        const pct = v != null ? v - 100 : null;
        add(legendEl, h('span', { class: 'inline-flex items-center gap-1.5' },
          h('span', { class: 'legend-key', style: { background: MC.util.coinColor(k), height: k === 'btc' ? '1.5px' : '2px' } }),
          h('span', { class: 'font-medium text-ink', text: c.symbol }),
          h('span', { class: (pct > 0 ? 'text-up' : pct < 0 ? 'text-down' : 'text-ink-3') + ' num', text: fmtPct(pct) })));
      });
    }
    chart.subscribeCrosshairMove(renderLegend);
    function applyTheme() {
      chart.applyOptions(baseOptions({ localization: { locale: 'es-AR', priceFormatter: (v) => fmtNum(v, 1, 1) },
        timeScale: { borderColor: themeColors().border, timeVisible: false }, handleScroll: false, handleScale: false }));
      keys.forEach((k) => series[k].applyOptions({ color: MC.util.coinColor(k) }));
      if (last) setData(last.hist, last.days);
    }
    return { chart, setData, applyTheme };
  }

  // ======================================================= Miedo y Codicia (historia)
  function fngColor(v) {
    const z = v <= 25 ? '--fg-xfear' : v <= 46 ? '--fg-fear' : v <= 54 ? '--fg-neutral' : v <= 75 ? '--fg-greed' : '--fg-xgreed';
    return cssVar(z);
  }
  function createFng(container, legendEl) {
    const opts = () => baseOptions({
      localization: { locale: 'es-AR', priceFormatter: (v) => fmtNum(v, 0) },
      timeScale: { borderColor: themeColors().border, timeVisible: false, rightOffset: 2 },
      handleScroll: false, handleScale: false,
    });
    const chart = LWC.createChart(container, opts());
    const range = () => ({ priceRange: { minValue: 0, maxValue: 100 } });
    const alt = chart.addSeries(LWC.LineSeries, lineOpts(themeColors().ink, 2, { autoscaleInfoProvider: range,
      lastValueVisible: true, crosshairMarkerVisible: true }));
    const cmc = chart.addSeries(LWC.LineSeries, lineOpts(themeColors().text, 1.5, { autoscaleInfoProvider: range,
      crosshairMarkerVisible: true }));
    const bands = [];
    function drawBands() {
      bands.splice(0).forEach((b) => alt.removePriceLine(b));
      [[25, 'Miedo extremo', '--fg-xfear'], [75, 'Codicia extrema', '--fg-xgreed'], [50, '', '--axis']].forEach(([p, t, v]) => {
        bands.push(alt.createPriceLine({ price: p, color: alpha(cssVar(v), 0.7), lineWidth: 1, lineStyle: LWC.LineStyle.Solid, axisLabelVisible: false, title: t }));
      });
    }
    drawBands();
    alt.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.06 } });
    let last = null;
    function setData(fng, days) {
      last = { fng, days };
      const cut = Date.now() - days * 86400000;
      const day = (t) => Math.floor(t / 86400000) * 86400;
      alt.setData(fng.series.filter((r) => r.t >= cut).map((r) => ({ time: day(r.t), value: r.v, color: fngColor(r.v) })));
      cmc.setData((fng.cmc.series || []).filter((r) => r.t >= cut).map((r) => ({ time: day(r.t), value: r.v })));
      chart.timeScale().fitContent();
      legend(null);
    }
    function legend(param) {
      if (!legendEl || !last) return;
      clear(legendEl);
      const val = (s) => {
        if (param && param.seriesData && param.seriesData.get(s)) return param.seriesData.get(s).value;
        const d = s.data(); return d.length ? d[d.length - 1].value : null;
      };
      const a = val(alt), b = val(cmc);
      add(legendEl, 
        h('span', { class: 'inline-flex items-center gap-1.5' }, h('span', { class: 'legend-key', style: { background: themeColors().ink } }),
          h('span', { class: 'text-ink-3', text: 'Alternative.me ' }), h('span', { class: 'font-semibold text-ink num', text: a != null ? String(a) : '—' })),
        h('span', { class: 'inline-flex items-center gap-1.5' }, h('span', { class: 'legend-key', style: { background: themeColors().text, height: '1.5px' } }),
          h('span', { class: 'text-ink-3', text: 'CoinMarketCap ' }), h('span', { class: 'font-semibold text-ink num', text: b != null ? String(b) : '—' })),
        h('span', { class: 'text-ink-3', text: 'El color de la línea indica la zona (rojo = miedo, verde = codicia).' }),
      );
    }
    chart.subscribeCrosshairMove(legend);
    function applyTheme() {
      chart.applyOptions(opts());
      alt.applyOptions({ color: themeColors().ink });
      cmc.applyOptions({ color: themeColors().text });
      drawBands();
      if (last) setData(last.fng, last.days);
    }
    return { chart, setData, applyTheme };
  }

  MC.charts = { createMain, createRelative, createFng, fngColor, chartColor, alpha, themeColors };
})();
