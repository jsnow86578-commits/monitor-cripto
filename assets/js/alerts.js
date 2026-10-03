/* Monitor Cripto — alertas de precio y de señales técnicas (se guardan en este navegador). */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const { h, clear, storage, fmtPrice, fmtNum, fmtDate, fmtAgo, fmtPct, isNum, icon } = MC.util;
  const cfg = MC.config;
  const add = (el, ...kids) => MC.util.append(el, kids);   // ignora null/false

  const TYPES = {
    above: 'El precio sube por encima de',
    below: 'El precio baja por debajo de',
    change24: 'La variación 24 h supera ±',
    rsi_above: 'El RSI 4h sube por encima de',
    rsi_below: 'El RSI 4h baja por debajo de',
    signal: 'Aparece una señal técnica 4h',
  };
  const SIGNAL_GROUPS = {
    div_bull: 'Divergencias alcistas', div_bear: 'Divergencias bajistas',
    double_top: 'Doble techo', double_bottom: 'Doble suelo', bull_flag: 'Bandera alcista',
  };
  const groupOf = (type) => (type.startsWith('div_bull') ? 'div_bull' : type.startsWith('div_bear') ? 'div_bear' : type);

  let alerts = storage.get('alerts', []);
  let log = storage.get('alerts:log', []);
  let seen = storage.get('alerts:seen', null);      // id de señal → estado ya notificado
  let lastQuote = null, watchTimer = null, unread = storage.get('alerts:unread', 0);
  const save = () => { storage.set('alerts', alerts); storage.set('alerts:log', log.slice(0, 40)); storage.set('alerts:unread', unread); };

  const notifSupported = () => 'Notification' in window && window.isSecureContext;
  const sym = (k) => (MC.util.coin(k) || {}).symbol || k;

  function describe(a) {
    const base = a.coin === 'all' ? 'Cualquier moneda' : sym(a.coin);
    if (a.type === 'above' || a.type === 'below') return `${sym(a.coin)} ${a.type === 'above' ? '≥' : '≤'} ${fmtPrice(a.value)}`;
    if (a.type === 'change24') return `${sym(a.coin)}: variación 24 h ≥ ±${fmtNum(a.value, 2)}%`;
    if (a.type === 'rsi_above') return `${sym(a.coin)}: RSI 4h ≥ ${fmtNum(a.value, 0)}`;
    if (a.type === 'rsi_below') return `${sym(a.coin)}: RSI 4h ≤ ${fmtNum(a.value, 0)}`;
    const groups = (a.groups && a.groups.length ? a.groups : Object.keys(SIGNAL_GROUPS)).map((g) => SIGNAL_GROUPS[g]);
    return `${base}: ${groups.length === Object.keys(SIGNAL_GROUPS).length ? 'cualquier señal 4h' : groups.join(', ')}`;
  }

  // ------------------------------------------------------------ disparo
  let audioCtx = null;
  function beep() {
    if (!storage.get('alerts:sound', true)) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.0001;
      o.connect(g); g.connect(audioCtx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      o.stop(audioCtx.currentTime + 0.4);
    } catch (e) { /* sin audio */ }
  }
  function fire(title, body, opts = {}) {
    log.unshift({ t: Date.now(), title, body, coin: opts.coin || null });
    log = log.slice(0, 40);
    unread += 1;
    save();
    MC.ui && MC.ui.toast({ title, body, tone: opts.tone || 'accent', timeout: 12000 });
    beep();
    if (notifSupported() && Notification.permission === 'granted') {
      try { new Notification(title, { body, tag: opts.tag || undefined, icon: undefined }); } catch (e) { /* noop */ }
    }
    renderBadge();
    if (isOpen()) render();
  }

  // --------------------------------------------------------- evaluación precio
  function evaluatePrices(prices, source, ts) {
    let changed = false, hit = false;
    alerts.forEach((a) => {
      if (!a.active || !(a.type === 'above' || a.type === 'below')) return;
      const p = prices[a.coin];
      if (!isNum(p)) return;
      const side = p >= a.value ? 'above' : 'below';
      if (a.side && a.side !== side && side === a.type) {
        fire(`${sym(a.coin)} ${a.type === 'above' ? 'superó' : 'perforó'} ${fmtPrice(a.value)}`,
          `Precio ${fmtPrice(p)} · ${source} · ${fmtDate(ts)}`, { coin: a.coin, tone: a.type === 'above' ? 'up' : 'down', tag: a.id });
        a.lastTriggered = Date.now();
        if (!a.repeat) a.active = false;
        hit = true;
      }
      if (a.side !== side) { a.side = side; changed = true; }
    });
    if (changed || hit) save();
    if (hit && MC.data) MC.data.runJob('prices', { force: true });
  }
  function evaluateChange(coins) {
    let changed = false;
    alerts.forEach((a) => {
      if (!a.active || a.type !== 'change24') return;
      const c = coins[a.coin];
      if (!c || !isNum(c.ch24h)) return;
      const cool = a.lastTriggered && Date.now() - a.lastTriggered < 12 * 3600e3;
      if (Math.abs(c.ch24h) >= a.value && !cool) {
        fire(`${sym(a.coin)} se movió ${fmtPct(c.ch24h)} en 24 h`, `Umbral ±${fmtNum(a.value, 2)}% · precio ${fmtPrice(c.price)}`,
          { coin: a.coin, tone: c.ch24h > 0 ? 'up' : 'down', tag: a.id });
        a.lastTriggered = Date.now();
        if (!a.repeat) a.active = false;
        changed = true;
      }
    });
    if (changed) save();
  }
  function evaluateRsi(analysisByCoin) {
    let changed = false;
    alerts.forEach((a) => {
      if (!a.active || !(a.type === 'rsi_above' || a.type === 'rsi_below')) return;
      const an = analysisByCoin[a.coin];
      if (!an || !isNum(an.rsiNow)) return;
      const side = an.rsiNow >= a.value ? 'rsi_above' : 'rsi_below';
      if (a.side && a.side !== side && side === a.type) {
        fire(`${sym(a.coin)}: RSI 4h ${a.type === 'rsi_above' ? 'sobre' : 'bajo'} ${fmtNum(a.value, 0)}`,
          `RSI actual ${fmtNum(an.rsiNow, 1)} (vela cerrada ${fmtDate(an.lastTime)})`, { coin: a.coin, tag: a.id });
        a.lastTriggered = Date.now();
        if (!a.repeat) a.active = false;
      }
      if (a.side !== side) { a.side = side; changed = true; }
    });
    if (changed) save();
  }
  /** Señales: notifica ids nuevos o cambios de estado (p. ej. bandera → ruptura). */
  function evaluateSignals(analysisByCoin) {
    const current = {};
    Object.entries(analysisByCoin).forEach(([coin, an]) => {
      (an.signals || []).forEach((s) => { if (s.recent) current[s.id] = { s, coin }; });
    });
    if (seen === null) {             // primera vez: registrar sin notificar
      seen = {};
      Object.entries(current).forEach(([id, { s }]) => { seen[id] = s.status; });
      storage.set('alerts:seen', seen);
      return;
    }
    const watchers = alerts.filter((a) => a.active && a.type === 'signal');
    let changed = false;
    Object.entries(current).forEach(([id, { s, coin }]) => {
      if (seen[id] === s.status) return;
      const isNew = !(id in seen);
      seen[id] = s.status;
      changed = true;
      const match = watchers.find((a) => (a.coin === 'all' || a.coin === coin) &&
        (!a.groups || !a.groups.length || a.groups.includes(groupOf(s.type))));
      if (!match) return;
      const when = isNew ? 'Nueva señal' : 'Actualización';
      fire(`${when}: ${sym(coin)} · ${s.label}`, `${s.statusLabel} · velas de 4 h · ${fmtDate(s.tEvent)}`,
        { coin, tone: s.direction === 'bullish' ? 'up' : 'down', tag: id });
      match.lastTriggered = Date.now();
    });
    // podar ids viejos
    const keep = {};
    Object.keys(seen).forEach((id) => { if (current[id]) keep[id] = seen[id]; });
    seen = keep;
    storage.set('alerts:seen', seen);
    save();
  }

  // --------------------------------------------------------- vigilancia
  function needsWatch() { return alerts.some((a) => a.active && (a.type === 'above' || a.type === 'below')); }
  async function watchTick() {
    if (!needsWatch()) return;
    try {
      lastQuote = await MC.data.quickQuotes();
      evaluatePrices(lastQuote.prices, lastQuote.source, lastQuote.ts);
      if (isOpen()) renderWatch();
    } catch (e) { lastQuote = { error: e.message, ts: Date.now() }; }
  }
  function syncWatcher() {
    if (needsWatch() && !watchTimer) {
      watchTimer = setInterval(watchTick, cfg.intervals.alertsWatch);
      watchTick();
    } else if (!needsWatch() && watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  }

  // --------------------------------------------------------------- UI
  const drawer = () => document.getElementById('alerts-drawer');
  const scrim = () => document.getElementById('alerts-scrim');
  const isOpen = () => drawer() && drawer().dataset.open === 'true';
  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    drawer().dataset.open = 'true'; drawer().setAttribute('aria-hidden', 'false'); scrim().hidden = false;
    unread = 0; save(); renderBadge(); render();
    setTimeout(() => { const f = drawer().querySelector('select, input, button'); f && f.focus(); }, 50);
  }
  function close() {
    drawer().dataset.open = 'false'; drawer().setAttribute('aria-hidden', 'true'); scrim().hidden = true;
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  function renderBadge() {
    const el = document.getElementById('alerts-count');
    if (!el) return;
    const active = alerts.filter((a) => a.active).length;
    const n = unread || active;
    el.textContent = String(n);
    el.hidden = false;
    el.classList.toggle('hidden', !n);
    el.style.background = unread ? 'var(--down-mark)' : 'var(--accent)';
    el.title = unread ? `${unread} alerta(s) nueva(s)` : `${active} alerta(s) activa(s)`;
  }

  function currentPrice(coin) {
    const p = MC.data.state.prices && MC.data.state.prices.coins[coin];
    return lastQuote && lastQuote.prices && isNum(lastQuote.prices[coin]) ? lastQuote.prices[coin] : p ? p.price : null;
  }

  function renderNotifBox() {
    const box = h('div', { class: 'rounded-xl border border-line bg-surface-2 p-3 text-[0.8rem]' });
    let msg, btns = [];
    if (!notifSupported()) {
      msg = 'Las notificaciones del sistema requieren abrir el tablero con serve.py (localhost) o desde la web publicada (https). Mientras tanto, las alertas aparecen dentro de la página.';
    } else if (Notification.permission === 'granted') {
      msg = 'Notificaciones del navegador activadas.';
      btns.push(h('button', { class: 'btn !py-1 text-[0.74rem]', type: 'button', text: 'Probar', onclick: () => fire('Prueba de alerta', 'Si ves esto, las notificaciones funcionan.') }));
    } else if (Notification.permission === 'denied') {
      msg = 'Bloqueaste las notificaciones para este sitio. Podés habilitarlas desde el candado de la barra de direcciones.';
    } else {
      msg = 'Activá las notificaciones para enterarte aunque la pestaña esté en segundo plano.';
      btns.push(h('button', { class: 'btn btn-primary !py-1 text-[0.74rem]', type: 'button', text: 'Activar notificaciones',
        onclick: async () => { try { await Notification.requestPermission(); } catch (e) { /* noop */ } render(); } }));
    }
    const sound = storage.get('alerts:sound', true);
    add(box, h('p', { class: 'text-ink-2', text: msg }),
      h('div', { class: 'mt-2 flex flex-wrap items-center gap-2' }, btns,
        h('label', { class: 'ml-auto inline-flex cursor-pointer items-center gap-1.5 text-ink-2' },
          h('input', { type: 'checkbox', checked: sound ? true : null, onchange: (e) => storage.set('alerts:sound', e.target.checked) }), 'Sonido')));
    return box;
  }

  function renderForm() {
    const form = h('form', { class: 'space-y-3', 'aria-label': 'Nueva alerta' });
    const coinSel = h('select', { class: 'input', name: 'coin' },
      cfg.coins.map((c) => h('option', { value: c.key, text: `${c.symbol} · ${c.name}` })),
      h('option', { value: 'all', text: 'Todas (solo señales)' }));
    const typeSel = h('select', { class: 'input', name: 'type' },
      Object.entries(TYPES).map(([k, v]) => h('option', { value: k, text: v })));
    const val = h('input', { class: 'input num', name: 'value', type: 'number', step: 'any', min: '0', inputmode: 'decimal', placeholder: 'Valor' });
    const hint = h('p', { class: 'text-[0.72rem] text-ink-3' });
    const groupsBox = h('div', { class: 'flex flex-wrap gap-1.5', hidden: true });
    Object.entries(SIGNAL_GROUPS).forEach(([k, v]) => {
      add(groupsBox, h('label', { class: 'chip cursor-pointer' }, h('input', { type: 'checkbox', value: k, checked: true, class: 'mr-0.5' }), v));
    });
    const repeat = h('input', { type: 'checkbox', name: 'repeat' });
    const update = () => {
      const t = typeSel.value, coin = coinSel.value;
      const isSignal = t === 'signal';
      groupsBox.hidden = !isSignal;
      val.parentElement.hidden = isSignal;
      if (coin === 'all' && !isSignal) coinSel.value = cfg.coins[0].key;
      const p = currentPrice(coinSel.value);
      if (t === 'above' || t === 'below') {
        hint.textContent = isNum(p) ? `Precio actual de ${sym(coinSel.value)}: ${fmtPrice(p)}. Se dispara al cruzar el valor.` : 'Se dispara al cruzar el valor.';
        if (!val.value && isNum(p)) val.value = (t === 'above' ? p * 1.05 : p * 0.95).toPrecision(4);
      } else if (t === 'change24') { hint.textContent = 'Porcentaje absoluto: 8 = avisa si sube o baja 8% o más en 24 h.'; if (!val.value) val.value = '8'; }
      else if (t.startsWith('rsi')) { hint.textContent = 'RSI de 14 períodos sobre velas cerradas de 4 h (70 = sobrecompra, 30 = sobreventa).'; if (!val.value) val.value = t === 'rsi_above' ? '70' : '30'; }
      else hint.textContent = 'Avisa cuando el radar detecta una señal nueva o cambia su estado (p. ej., una bandera pasa a ruptura).';
    };
    typeSel.addEventListener('change', () => { val.value = ''; update(); });
    coinSel.addEventListener('change', () => { val.value = ''; update(); });
    add(form, 
      h('div', { class: 'grid grid-cols-2 gap-2' },
        h('label', { class: 'field' }, 'Moneda', coinSel),
        h('label', { class: 'field' }, 'Valor', val)),
      h('label', { class: 'field' }, 'Condición', typeSel),
      groupsBox, hint,
      h('label', { class: 'inline-flex items-center gap-2 text-[0.8rem] text-ink-2' }, repeat, 'Repetir (no desactivar al dispararse)'),
      h('button', { class: 'btn btn-primary w-full', type: 'submit', text: 'Crear alerta' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = typeSel.value, coin = coinSel.value;
      const a = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), coin, type: t, active: true,
        repeat: repeat.checked, created: Date.now() };
      if (t !== 'signal') {
        const v = parseFloat(String(val.value).replace(',', '.'));
        if (!isNum(v) || v <= 0) { hint.textContent = 'Ingresá un valor numérico mayor que cero.'; val.focus(); return; }
        a.value = v;
        if (t === 'above' || t === 'below') { const p = currentPrice(coin); if (isNum(p)) a.side = p >= v ? 'above' : 'below'; }
        if (t.startsWith('rsi')) { const an = MC.analysis && MC.analysis.h4[coin]; if (an && isNum(an.rsiNow)) a.side = an.rsiNow >= v ? 'rsi_above' : 'rsi_below'; }
      } else {
        a.groups = Array.from(groupsBox.querySelectorAll('input:checked')).map((i) => i.value);
      }
      alerts.unshift(a); save(); syncWatcher(); renderBadge(); render();
      MC.ui.toast({ title: 'Alerta creada', body: describe(a), tone: 'accent', timeout: 4000 });
    });
    setTimeout(update, 0);
    return form;
  }

  function renderList() {
    const wrap = h('div', { class: 'space-y-2' });
    if (!alerts.length) { add(wrap, h('p', { class: 'text-[0.8rem] text-ink-3', text: 'Todavía no creaste alertas.' })); return wrap; }
    alerts.forEach((a) => {
      add(wrap, h('div', { class: 'flex items-center gap-2 rounded-xl border border-line p-2.5' + (a.active ? '' : ' opacity-60') },
        h('span', { class: 'dot', style: { background: a.active ? 'var(--up-mark)' : 'var(--ink-3)' } }),
        h('div', { class: 'min-w-0 flex-1' },
          h('div', { class: 'truncate text-[0.82rem] font-medium', text: describe(a) }),
          h('div', { class: 'text-[0.7rem] text-ink-3', text: (a.active ? 'Activa' : 'Pausada / disparada') + (a.repeat ? ' · se repite' : '') +
            (a.lastTriggered ? ' · última: ' + fmtAgo(a.lastTriggered) : '') })),
        h('button', { class: 'btn !px-2 !py-1 text-[0.72rem]', type: 'button', text: a.active ? 'Pausar' : 'Activar',
          onclick: () => { a.active = !a.active; if (a.active && (a.type === 'above' || a.type === 'below')) { const p = currentPrice(a.coin); if (isNum(p)) a.side = p >= a.value ? 'above' : 'below'; } save(); syncWatcher(); renderBadge(); render(); } }),
        h('button', { class: 'btn btn-icon !h-8 !w-8', type: 'button', 'aria-label': 'Eliminar alerta', title: 'Eliminar',
          onclick: () => { alerts = alerts.filter((x) => x.id !== a.id); save(); syncWatcher(); renderBadge(); render(); } }, icon('trash'))));
    });
    return wrap;
  }

  function renderWatch() {
    const el = document.getElementById('alerts-watch');
    if (!el) return;
    clear(el);
    if (!needsWatch()) { el.textContent = 'Sin alertas de precio activas: la vigilancia está en pausa.'; return; }
    const mins = Math.round(cfg.intervals.alertsWatch / 60000);
    if (!lastQuote) { el.textContent = `Vigilancia cada ${mins} min mientras esta página esté abierta.`; return; }
    if (lastQuote.error) { el.textContent = `Último chequeo con error (${lastQuote.error}). Se reintenta en ${mins} min.`; return; }
    add(el, `Vigilancia cada ${mins} min · ${lastQuote.source} · ${fmtDate(lastQuote.ts, 'time')} · `,
      Object.entries(lastQuote.prices).map(([k, p], i) => (i ? ' · ' : '') + `${sym(k)} ${fmtPrice(p)}`).join(''));
  }

  function render() {
    const body = document.getElementById('alerts-body');
    if (!body) return;
    clear(body);
    add(body, 
      renderNotifBox(),
      h('section', null, h('h3', { class: 'eyebrow mb-2', text: 'Nueva alerta' }), renderForm()),
      h('section', null, h('h3', { class: 'eyebrow mb-2', text: `Mis alertas (${alerts.length})` }), renderList(),
        h('p', { id: 'alerts-watch', class: 'mt-2 text-[0.72rem] text-ink-3' })),
      h('section', null, h('h3', { class: 'eyebrow mb-2', text: 'Historial' }),
        log.length ? h('ul', { class: 'space-y-1.5' }, log.slice(0, 15).map((l) => h('li', { class: 'text-[0.78rem]' },
          h('span', { class: 'font-medium', text: l.title }), h('span', { class: 'text-ink-3', text: ` · ${l.body} · ${fmtAgo(l.t)}` }))))
          : h('p', { class: 'text-[0.8rem] text-ink-3', text: 'Sin alertas disparadas todavía.' }),
        log.length ? h('button', { class: 'btn mt-2 !py-1 text-[0.72rem]', type: 'button', text: 'Borrar historial', onclick: () => { log = []; save(); render(); } }) : null),
      h('p', { class: 'text-[0.72rem] text-ink-3', text: 'Las alertas se guardan solo en este navegador y funcionan mientras el tablero esté abierto (puede ser en segundo plano).' }),
    );
    renderWatch();
  }

  function init() {
    document.getElementById('btn-alerts').addEventListener('click', open);
    document.getElementById('alerts-close').addEventListener('click', close);
    scrim().addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
    renderBadge();
    syncWatcher();
  }

  MC.alerts = { init, open, close, evaluatePrices, evaluateChange, evaluateRsi, evaluateSignals, describe, list: () => alerts, TYPES };
})();
