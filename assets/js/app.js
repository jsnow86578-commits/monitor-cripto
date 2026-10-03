/* Monitor Cripto — arranque y orquestación. */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const U = MC.util, cfg = MC.config;

  // ------------------------------------------------------------ vista
  const defaults = {
    chartCoin: 'xrp', chartTf: '4h', highlight: null,
    layers: { div: true, double: true, flag: true, ma: false, volume: true, history: false },
    sigCoin: 'all', sigDir: 'all', relDays: 90, fngDays: 90,
    news: { kind: 'all', coin: 'all', tag: null, limit: cfg.news.pageSize },
  };
  const saved = U.storage.get('view', {}) || {};
  MC.view = Object.assign({}, defaults, saved, {
    layers: Object.assign({}, defaults.layers, saved.layers || {}),
    news: Object.assign({}, defaults.news, saved.news || {}, { limit: cfg.news.pageSize }),
    highlight: null,
  });
  if (!cfg.coins.some((c) => c.key === MC.view.chartCoin)) MC.view.chartCoin = 'xrp';
  function saveView() { const v = Object.assign({}, MC.view); delete v.highlight; U.storage.set('view', v); }

  // ------------------------------------------------------------ análisis
  MC.analysis = { h4: {}, d1: {}, pulse: {}, corr: null };
  function analyze4h() {
    const st = MC.data.state.candles4h;
    if (!st) return;
    cfg.coins.forEach((c) => {
      const cs = st.series[c.key];
      if (cs && cs.length > 60) MC.analysis.h4[c.key] = MC.TA.analyze(cs, { coin: c.key, tf: '4h', intervalMs: 4 * 3600e3, recentBars: cfg.ta.recentBars });
    });
  }
  function analyze1d() {
    const st = MC.data.state.candles1d;
    if (!st) return;
    cfg.coins.forEach((c) => {
      const cs = st.series[c.key];
      if (!cs || cs.length < 40) return;
      MC.analysis.d1[c.key] = MC.TA.analyze(cs, { coin: c.key, tf: '1d', intervalMs: 86400e3, recentBars: 30, warmup: 60 });
      MC.analysis.pulse[c.key] = MC.TA.pulse(cs);
    });
  }
  function analyzeCorr() {
    const st = MC.data.state.history;
    if (!st) return;
    MC.analysis.corr = MC.TA.correlationMatrix(st.series, 90);
  }

  // ------------------------------------------------------------ render
  const R = MC.ui;
  function renderAll() {
    R.renderStatusPills(); R.banner();
    R.renderCoinCards(); R.renderFng(); R.renderInsights();
    R.renderSignalFilters(); R.renderSignals();
    R.renderChartControls(); R.renderChart(true);
    R.renderPulse(); R.renderRelative(); R.renderCorr(); R.renderFngHistory();
    R.renderFundamentals(); R.renderOfficialCards(); R.renderNewsFilters(); R.renderNews(); R.renderSources();
    footer();
  }
  function footer() {
    const el = U.$('#footer-meta');
    const st = MC.data.state.status;
    el.textContent = `Monitor Cripto v${cfg.version} · ${MC.data.IS_FILE ? 'modo archivo local' : 'servido por web'} · frecuencias: precios 1 h · Miedo y Codicia 3 h · fundamentales 6 h · fuentes oficiales 12 h` +
      (st && st.generated_at ? ` · scripts: ${U.fmtAgo(st.generated_at)}` : '');
  }
  const renderers = {
    prices: () => { R.renderCoinCards(); R.renderInsights(); R.renderPulse(); MC.alerts.evaluateChange(MC.data.state.prices.coins); },
    fng: () => { R.renderFng(); R.renderFngHistory(); R.renderInsights(); },
    candles4h: () => {
      analyze4h();
      R.renderCoinCards(); R.renderSignals(); R.renderInsights(); R.renderPulse();
      if (MC.view.chartTf === '4h') R.renderChart(false);
      MC.alerts.evaluateSignals(MC.analysis.h4); MC.alerts.evaluateRsi(MC.analysis.h4);
    },
    candles1d: () => { analyze1d(); R.renderPulse(); R.renderCoinCards(); R.renderInsights(); if (MC.view.chartTf === '1d') R.renderChart(false); },
    history: () => { analyzeCorr(); R.renderRelative(); R.renderCorr(); R.renderInsights(); },
    fundamentals: () => { R.renderFundamentals(); R.renderOfficialCards(); R.renderNews(); R.renderInsights(); R.banner(); },
    official: () => { R.renderOfficialCards(); R.renderNews(); R.renderInsights(); },
    status: () => { R.renderSources(); footer(); },
  };

  function showSignal(s) {
    const v = MC.view;
    v.chartCoin = s.coin || (s.id || '').split(':')[0] || v.chartCoin;
    v.chartTf = (s.id || '').split(':')[1] === '1d' ? '1d' : '4h';
    v.highlight = s.id;
    saveView();
    R.renderChartControls(); R.renderChart(true);
    const an = (v.chartTf === '4h' ? MC.analysis.h4 : MC.analysis.d1)[v.chartCoin];
    const sig = an && an.signals.find((x) => x.id === s.id);
    if (sig && MC.app.mainChart) MC.app.mainChart.focus(sig);
    document.getElementById('chart').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ------------------------------------------------------------ tema
  function currentTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function themeIcon() {
    const b = document.getElementById('btn-theme');
    U.clear(b);
    b.append(U.icon(currentTheme() === 'dark' ? 'sun' : 'moon'));
    b.setAttribute('aria-label', currentTheme() === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
  }
  function applyThemeEverywhere() {
    themeIcon();
    const meta = document.querySelectorAll('meta[name="theme-color"]');
    meta.forEach((m) => m.setAttribute('content', currentTheme() === 'dark' ? '#0b0d10' : '#f4f6f8'));
    ['mainChart', 'relChart', 'fngChart'].forEach((k) => MC.app[k] && MC.app[k].applyTheme());
    R.renderFng(); R.renderCorr(); R.renderCoinCards();
  }

  // ------------------------------------------------------------ eventos
  function wire() {
    document.getElementById('btn-theme').addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      U.storage.set('theme', next);
      try { localStorage.setItem('mc:theme', next); } catch (e) { /* noop */ }
      applyThemeEverywhere();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.getAttribute('data-theme')) applyThemeEverywhere(); });

    const btn = document.getElementById('btn-refresh');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const ok = await MC.data.refreshNow();
      btn.disabled = false;
      R.toast(ok ? { title: 'Datos actualizados', body: 'Precios, sentimiento y velas consultados en vivo.', tone: 'up', timeout: 3500 }
        : { title: 'Esperá un momento', body: 'La actualización manual se puede usar una vez por minuto.', tone: 'warn', timeout: 3500 });
    });
    document.getElementById('btn-status').addEventListener('click', R.openStatus);
    document.getElementById('status-close').addEventListener('click', () => document.getElementById('status-dialog').close());

    U.$$('#chart-tf button').forEach((b) => b.addEventListener('click', () => {
      MC.view.chartTf = b.dataset.tf; MC.view.highlight = null; saveView(); R.renderChartControls(); R.renderChart(true);
    }));
    U.$$('#rel-range button').forEach((b) => b.addEventListener('click', () => { MC.view.relDays = +b.dataset.days; saveView(); R.renderRelative(); }));
    U.$$('#fngh-range button').forEach((b) => b.addEventListener('click', () => { MC.view.fngDays = +b.dataset.days; saveView(); R.renderFngHistory(); }));
    const relToggle = document.getElementById('rel-table-toggle');
    relToggle.addEventListener('click', () => {
      const t = document.getElementById('rel-table');
      t.hidden = !t.hidden; relToggle.setAttribute('aria-expanded', String(!t.hidden)); relToggle.textContent = t.hidden ? 'Tabla' : 'Ocultar tabla';
      R.renderRelative();
    });
    U.$$('#news-kind button').forEach((b) => b.addEventListener('click', () => {
      MC.view.news.kind = b.dataset.kind; MC.view.news.limit = cfg.news.pageSize; saveView(); R.renderNewsFilters(); R.renderNews();
    }));
    document.getElementById('news-more').addEventListener('click', () => { MC.view.news.limit += cfg.news.pageSize; R.renderNews(); });
  }

  // ------------------------------------------------------------ arranque
  function start() {
    MC.app = { saveView, showSignal, mainChart: null, relChart: null, fngChart: null };
    themeIcon();
    try {
      MC.app.mainChart = MC.charts.createMain(document.getElementById('tv-chart'), document.getElementById('chart-legend'));
      MC.app.relChart = MC.charts.createRelative(document.getElementById('rel-chart'), document.getElementById('rel-legend'));
      MC.app.fngChart = MC.charts.createFng(document.getElementById('fngh-chart'), document.getElementById('fngh-legend'));
    } catch (e) {
      console.error('No se pudieron crear los gráficos', e);
    }
    wire();
    MC.alerts.init();

    let booting = true;
    MC.data.on('data', ({ job }) => {
      if (booting) return;
      try { (renderers[job] || (() => {}))(); } catch (e) { console.error(job, e); }
      R.renderStatusPills();
    });
    MC.data.on('meta', () => R.renderStatusPills());
    MC.data.init();                 // aplica snapshot/caché de inmediato
    analyze4h(); analyze1d(); analyzeCorr();
    booting = false;
    renderAll();
    if (MC.analysis.h4 && Object.keys(MC.analysis.h4).length) MC.alerts.evaluateSignals(MC.analysis.h4);
    setInterval(() => { R.renderStatusPills(); }, 30000);
    setInterval(() => { R.renderFng(); R.renderInsights(); }, 5 * 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
