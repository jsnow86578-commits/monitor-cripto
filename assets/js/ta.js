/*!
 * Monitor Cripto — motor de análisis técnico (sin dependencias).
 * Indicadores: SMA, EMA, RSI (Wilder, igual que TradingView), ATR, volatilidad, correlación.
 * Patrones: divergencias RSI (regulares/ocultas, lógica del indicador "Divergence" de TradingView),
 *           doble techo, doble suelo y bandera alcista.
 * Las velas son arrays [t_ms, open, high, low, close, volume|null]. Solo se analizan velas CERRADAS.
 */
(function (root, factory) {
  const TA = factory();
  if (typeof module === 'object' && module.exports) module.exports = TA;
  else { root.MC = root.MC || {}; root.MC.TA = TA; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const T = 0, O = 1, H = 2, L = 3, C = 4, V = 5;

  // ------------------------------------------------------------------ util
  const isNum = (x) => typeof x === 'number' && isFinite(x);
  const col = (candles, k) => candles.map((c) => c[k]);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function linreg(xs, ys) {
    const n = xs.length;
    if (n < 2) return { a: ys[0] || 0, b: 0 };
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const den = n * sxx - sx * sx;
    const b = den === 0 ? 0 : (n * sxy - sx * sy) / den;
    return { a: (sy - b * sx) / n, b };
  }
  function argMin(arr, from, to) { let k = from; for (let i = from; i <= to; i++) if (arr[i] < arr[k]) k = i; return k; }
  function argMax(arr, from, to) { let k = from; for (let i = from; i <= to; i++) if (arr[i] > arr[k]) k = i; return k; }

  // ------------------------------------------------------------- indicadores
  function sma(values, n) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= n) sum -= values[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  function ema(values, n) {
    const out = new Array(values.length).fill(null);
    if (values.length < n) return out;
    const k = 2 / (n + 1);
    let prev = 0;
    for (let i = 0; i < n; i++) prev += values[i];
    prev /= n;
    out[n - 1] = prev;
    for (let i = n; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out[i] = prev; }
    return out;
  }

  /** RMA de Wilder (ta.rma de Pine): semilla = SMA de los primeros n valores. */
  function rma(values, n, start) {
    const out = new Array(values.length).fill(null);
    const s = start || 0;
    if (values.length - s < n) return out;
    let acc = 0;
    for (let i = s; i < s + n; i++) acc += values[i];
    let prev = acc / n;
    out[s + n - 1] = prev;
    for (let i = s + n; i < values.length; i++) { prev = (prev * (n - 1) + values[i]) / n; out[i] = prev; }
    return out;
  }

  /** RSI idéntico a ta.rsi de TradingView. */
  function rsi(closes, n = 14) {
    const len = closes.length;
    const up = new Array(len).fill(0), dn = new Array(len).fill(0);
    for (let i = 1; i < len; i++) {
      const ch = closes[i] - closes[i - 1];
      up[i] = ch > 0 ? ch : 0;
      dn[i] = ch < 0 ? -ch : 0;
    }
    const ru = rma(up, n, 1), rd = rma(dn, n, 1);
    const out = new Array(len).fill(null);
    for (let i = 0; i < len; i++) {
      if (ru[i] === null || rd[i] === null) continue;
      out[i] = rd[i] === 0 ? 100 : ru[i] === 0 ? 0 : 100 - 100 / (1 + ru[i] / rd[i]);
    }
    return out;
  }

  function atr(candles, n = 14) {
    const tr = candles.map((c, i) => {
      if (i === 0) return c[H] - c[L];
      const pc = candles[i - 1][C];
      return Math.max(c[H] - c[L], Math.abs(c[H] - pc), Math.abs(c[L] - pc));
    });
    return rma(tr, n, 0);
  }

  function logReturns(closes) {
    const out = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > 0 && closes[i - 1] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
    }
    return out;
  }

  function stdev(arr) {
    if (arr.length < 2) return null;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1));
  }

  function pearson(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 3) return null;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da && db ? num / Math.sqrt(da * db) : null;
  }

  /** Correlación de retornos diarios alineados por fecha (series: {key: [[t_ms, close], ...]}). */
  function correlationMatrix(series, days = 90) {
    const keys = Object.keys(series);
    const byDay = {};
    keys.forEach((k) => {
      (series[k] || []).forEach(([t, v]) => {
        const d = Math.floor(t / 86400000);
        (byDay[d] = byDay[d] || {})[k] = v;
      });
    });
    const daysSorted = Object.keys(byDay).map(Number).sort((a, b) => a - b)
      .filter((d) => keys.every((k) => isNum(byDay[d][k])));
    const window = daysSorted.slice(-(days + 1));
    const rets = {};
    keys.forEach((k) => { rets[k] = logReturns(window.map((d) => byDay[d][k])); });
    const m = {};
    keys.forEach((a) => { m[a] = {}; keys.forEach((b) => { m[a][b] = a === b ? 1 : pearson(rets[a], rets[b]); }); });
    return { matrix: m, days: Math.max(0, window.length - 1) };
  }

  // ------------------------------------------------------------------ pivotes
  /** Pivote alto en i: estrictamente mayor que las `left` velas previas y >= que las `right` siguientes. */
  function pivotHighs(series, left, right) {
    const out = [];
    for (let i = left; i < series.length - right; i++) {
      const v = series[i];
      if (!isNum(v)) continue;
      let ok = true;
      for (let j = i - left; j < i && ok; j++) if (!isNum(series[j]) || !(v > series[j])) ok = false;
      for (let j = i + 1; j <= i + right && ok; j++) if (!isNum(series[j]) || !(v >= series[j])) ok = false;
      if (ok) out.push(i);
    }
    return out;
  }
  function pivotLows(series, left, right) {
    return pivotHighs(series.map((v) => (isNum(v) ? -v : v)), left, right);
  }

  // ------------------------------------------------------------- divergencias
  /**
   * Replica el indicador "Divergence Indicator" incluido en TradingView:
   * pivotes sobre el RSI (5 izq / 5 der), rango entre pivotes 5–60 velas,
   * y comparación con el mínimo/máximo del precio en esas mismas velas.
   */
  function rsiDivergences(candles, rsiArr, opts = {}) {
    const lbL = opts.lbL ?? 5, lbR = opts.lbR ?? 5;
    const rangeLower = opts.rangeLower ?? 5, rangeUpper = opts.rangeUpper ?? 60;
    const hidden = opts.hidden ?? true;
    const warmup = opts.warmup ?? 100;
    const out = [];
    const lows = col(candles, L), highs = col(candles, H);
    const pl = pivotLows(rsiArr, lbL, lbR), ph = pivotHighs(rsiArr, lbL, lbR);

    const push = (type, kind, dir, i1, i2, p1, p2) => {
      const r1 = rsiArr[i1], r2 = rsiArr[i2];
      const rsiDelta = Math.abs(r2 - r1);
      const pricePct = Math.abs((p2 - p1) / p1) * 100;
      let score = 35 + rsiDelta * 2.2 + Math.min(20, pricePct * 3);
      if (dir === 'bullish' && kind === 'regular') score += r1 < 30 ? 18 : r1 < 40 ? 9 : 0;
      if (dir === 'bearish' && kind === 'regular') score += r1 > 70 ? 18 : r1 > 60 ? 9 : 0;
      if (kind === 'hidden') score -= 8;
      out.push({
        type, kind, direction: dir, i1, i2, confirmIdx: i2 + lbR,
        t1: candles[i1][T], t2: candles[i2][T], tConfirm: candles[Math.min(candles.length - 1, i2 + lbR)][T],
        price1: p1, price2: p2, rsi1: r1, rsi2: r2,
        score: Math.round(clamp(score, 5, 99)),
      });
    };

    for (let k = 1; k < pl.length; k++) {
      const i1 = pl[k - 1], i2 = pl[k];
      const bars = i2 - i1 - 1;                    // igual que ta.barssince(plFound[1])
      if (i1 < warmup || bars < rangeLower || bars > rangeUpper) continue;
      if (lows[i2] < lows[i1] && rsiArr[i2] > rsiArr[i1]) push('div_bull', 'regular', 'bullish', i1, i2, lows[i1], lows[i2]);
      else if (hidden && lows[i2] > lows[i1] && rsiArr[i2] < rsiArr[i1]) push('div_bull_hidden', 'hidden', 'bullish', i1, i2, lows[i1], lows[i2]);
    }
    for (let k = 1; k < ph.length; k++) {
      const i1 = ph[k - 1], i2 = ph[k];
      const bars = i2 - i1 - 1;
      if (i1 < warmup || bars < rangeLower || bars > rangeUpper) continue;
      if (highs[i2] > highs[i1] && rsiArr[i2] < rsiArr[i1]) push('div_bear', 'regular', 'bearish', i1, i2, highs[i1], highs[i2]);
      else if (hidden && highs[i2] < highs[i1] && rsiArr[i2] > rsiArr[i1]) push('div_bear_hidden', 'hidden', 'bearish', i1, i2, highs[i1], highs[i2]);
    }
    return out.sort((a, b) => a.confirmIdx - b.confirmIdx);
  }

  // -------------------------------------------------- doble techo / doble suelo
  function doublePatterns(candles, atrArr, opts = {}) {
    const left = opts.left ?? 6, right = opts.right ?? 4;
    const minBars = opts.minBars ?? 8, maxBars = opts.maxBars ?? 80;
    const maxWait = opts.maxWait ?? 36;            // velas que puede seguir "en formación"
    const warmup = opts.warmup ?? 30;
    const last = candles.length - 1;
    const highs = col(candles, H), lows = col(candles, L), closes = col(candles, C);
    const res = [];

    const evalPattern = (top, a, b, extreme1, extreme2) => {
      const d = b - a;
      if (a < warmup || d < minBars || d > maxBars) return null;
      const atrPct = (atrArr[b] || atrArr[a] || 0) / closes[b];
      const tol = clamp(0.6 * atrPct, 0.008, 0.03);
      const avg = (extreme1 + extreme2) / 2;
      if (Math.abs(extreme1 - extreme2) / avg > tol) return null;
      // Ningún extremo intermedio supera a los dos picos/valles.
      const capHi = Math.min(extreme1, extreme2) * (1 + tol * 0.25);
      const capLo = Math.max(extreme1, extreme2) * (1 - tol * 0.25);
      for (let i = a + 1; i < b; i++) {
        if (top && highs[i] > capHi) return null;
        if (!top && lows[i] < capLo) return null;
      }
      const mid = top ? argMin(lows, a, b) : argMax(highs, a, b);
      if (mid - a < 2 || b - mid < 2) return null;
      const neck = top ? lows[mid] : highs[mid];
      const depth = top ? (Math.min(extreme1, extreme2) - neck) / avg : (neck - Math.max(extreme1, extreme2)) / avg;
      const minDepth = Math.max(2.5 * atrPct, 0.03);
      if (depth < minDepth) return null;
      // Tendencia previa: subida (techo) o caída (suelo) al menos tan grande como el patrón.
      const lb = Math.max(d, 15);
      const from = Math.max(0, a - lb);
      if (a - from < 5) return null;
      if (top) {
        const prior = Math.min(...lows.slice(from, a));
        if ((extreme1 - prior) / prior < depth) return null;
      } else {
        const prior = Math.max(...highs.slice(from, a));
        if ((prior - extreme1) / extreme1 < depth) return null;
      }
      const height = top ? avg - neck : neck - avg;
      const target = top ? neck - height : neck + height;
      const limit = top ? Math.max(extreme1, extreme2) * (1 + tol * 0.5) : Math.min(extreme1, extreme2) * (1 - tol * 0.5);
      let status = 'forming', breakIdx = null, endIdx = null;
      for (let i = b + 1; i <= last; i++) {
        if (breakIdx === null) {
          if (top ? closes[i] > limit : closes[i] < limit) { status = 'invalidated'; endIdx = i; break; }
          if (top ? closes[i] < neck : closes[i] > neck) { status = 'confirmed'; breakIdx = i; continue; }
        } else {
          if (top ? lows[i] <= target : highs[i] >= target) { status = 'target'; endIdx = i; break; }
          if (top ? closes[i] > Math.max(extreme1, extreme2) : closes[i] < Math.min(extreme1, extreme2)) {
            status = 'failed'; endIdx = i; break;
          }
        }
      }
      if (status === 'forming' && last - b > maxWait) status = 'expired';
      const symmetry = 1 - Math.abs(extreme1 - extreme2) / avg / tol;          // 0..1
      let score = 40 + symmetry * 20 + Math.min(25, (depth / minDepth - 1) * 15);
      if (status === 'confirmed' || status === 'target') score += 12;
      const detectIdx = Math.min(last, b + right);
      return {
        type: top ? 'double_top' : 'double_bottom', direction: top ? 'bearish' : 'bullish',
        p1: a, p2: b, mid, neckline: neck, target, status, breakIdx, endIdx, detectIdx,
        t1: candles[a][T], t2: candles[b][T], tMid: candles[mid][T],
        tBreak: breakIdx !== null ? candles[breakIdx][T] : null,
        tDetect: candles[detectIdx][T],
        price1: extreme1, price2: extreme2, depthPct: depth * 100,
        score: Math.round(clamp(score, 5, 99)),
      };
    };

    const ph = pivotHighs(highs, left, right), pl = pivotLows(lows, left, right);
    [[ph, true], [pl, false]].forEach(([piv, top]) => {
      for (let k = 1; k < piv.length; k++) {
        for (const back of [1, 2]) {               // también admite un pivote intermedio menor
          if (k - back < 0) continue;
          const a = piv[k - back], b = piv[k];
          const e1 = top ? highs[a] : lows[a], e2 = top ? highs[b] : lows[b];
          const p = evalPattern(top, a, b, e1, e2);
          if (p) res.push(p);
        }
      }
    });
    // Sin solapamientos: por segundo extremo, quedarse con el de mayor puntaje.
    const best = {};
    res.forEach((p) => {
      const key = p.type + ':' + p.p2;
      if (!best[key] || best[key].score < p.score) best[key] = p;
    });
    const list = Object.values(best).sort((a, b) => a.p2 - b.p2);
    const filtered = [];
    list.forEach((p) => {
      const prev = filtered.filter((q) => q.type === p.type && q.p2 >= p.p1 && q.p1 <= p.p2);
      if (prev.length && prev.some((q) => q.score >= p.score)) return;
      for (const q of prev) filtered.splice(filtered.indexOf(q), 1);
      filtered.push(p);
    });
    const live = filtered.filter((p) => p.status !== 'expired');
    ['double_top', 'double_bottom'].forEach((type) => {
      const forming = live.filter((p) => p.type === type && p.status === 'forming');
      forming.slice(0, -1).forEach((p) => live.splice(live.indexOf(p), 1));   // reemplazados por el más reciente
    });
    return live;
  }

  // ------------------------------------------------------------- bandera alcista
  function bullFlags(candles, atrArr, opts = {}) {
    const minPole = opts.minPoleBars ?? 3, maxPole = opts.maxPoleBars ?? 15;
    const minFlag = opts.minFlagBars ?? 4, maxFlag = opts.maxFlagBars ?? 25;
    const poleATR = opts.poleATR ?? 3.5, minPolePct = opts.minPolePct ?? 0.06;
    const maxRetrace = opts.maxRetrace ?? 0.5, killRetrace = opts.killRetrace ?? 0.618;
    const warmup = opts.warmup ?? 30;
    const last = candles.length - 1;
    const highs = col(candles, H), lows = col(candles, L), closes = col(candles, C), vols = col(candles, V);
    const out = [];

    const lineOver = (from, to, src, above) => {
      const xs = [], ys = [];
      for (let i = from; i <= to; i++) { xs.push(i); ys.push(src[i]); }
      const { a, b } = linreg(xs, ys);
      let off = above ? -Infinity : Infinity;
      for (let i = from; i <= to; i++) {
        const r = src[i] - (a + b * i);
        off = above ? Math.max(off, r) : Math.min(off, r);
      }
      return { a: a + off, b, at: (i) => a + off + b * i };
    };

    for (let t = Math.max(warmup, maxPole); t <= last - minFlag; t++) {
      // t = techo del mástil: máximo de la ventana previa y no superado en las próximas minFlag velas
      if (highs[t] < Math.max(...highs.slice(t - maxPole, t))) continue;
      let ok = true;
      for (let i = t + 1; i <= t + minFlag; i++) if (highs[i] > highs[t]) { ok = false; break; }
      if (!ok) continue;
      const base = argMin(lows, t - maxPole, t - 1);
      const poleBars = t - base;
      if (poleBars < minPole) continue;
      const poleH = highs[t] - lows[base];
      const atrB = atrArr[base] || atrArr[t];
      if (!atrB) continue;
      const polePct = poleH / lows[base];
      if (polePct < Math.max(minPolePct, poleATR * atrB / closes[base])) continue;
      if (poleH / poleBars < 0.8 * atrB) continue;           // mástil empinado

      let status = 'forming', breakIdx = null, end = Math.min(last, t + maxFlag), killIdx = null;
      let minLow = Infinity, upper = null, lower = null;
      for (let k = t + 1; k <= Math.min(last, t + maxFlag); k++) {
        if (k - t > minFlag) {
          upper = lineOver(t, k - 1, highs, true);
          if (closes[k] > upper.at(k)) { status = 'breakout'; breakIdx = k; end = k - 1; break; }
        }
        minLow = Math.min(minLow, lows[k]);
        if ((highs[t] - minLow) / poleH > killRetrace || closes[k] < highs[t] - killRetrace * poleH) {
          // Si se rompe antes de completar la bandera, nunca fue una bandera.
          if (k - t <= minFlag) { status = 'none'; break; }
          status = 'invalidated'; killIdx = k; end = k - 1; break;
        }
        end = k;
      }
      if (status === 'none') continue;
      if (status === 'forming' && last > t + maxFlag) status = 'expired';
      const flagLen = end - t;
      if (flagLen < minFlag) continue;
      let flagMin = Infinity;
      for (let i = t + 1; i <= end; i++) flagMin = Math.min(flagMin, lows[i]);
      const retrace = (highs[t] - flagMin) / poleH;
      if (retrace > maxRetrace) continue;
      // Canal de la bandera: lateral o con pendiente bajista suave.
      const poleSlope = poleH / poleBars;
      const xs = [], ys = [];
      for (let i = t + 1; i <= end; i++) { xs.push(i); ys.push(closes[i]); }
      const slope = linreg(xs, ys).b;
      if (slope > 0.15 * poleSlope || slope < -0.9 * poleSlope) continue;
      upper = lineOver(t, end, highs, true);
      lower = lineOver(t + 1, end, lows, false);
      if (upper.b > 0.12 * poleSlope) continue;
      let volumeOk = null;
      if (isNum(vols[t])) {
        const avg = (a, b) => { let s = 0, n = 0; for (let i = a; i <= b; i++) if (isNum(vols[i])) { s += vols[i]; n++; } return n ? s / n : null; };
        const vp = avg(base + 1, t), vf = avg(t + 1, end);
        volumeOk = vp && vf ? vf < vp : null;
      }
      let finalStatus = status, endIdx = status === 'invalidated' ? killIdx : null;
      const breakLevel = breakIdx !== null ? upper.at(breakIdx) : upper.at(Math.min(last, end + 1));
      const target = breakLevel + poleH;
      if (status === 'breakout') {
        for (let i = breakIdx + 1; i <= last; i++) {
          if (highs[i] >= target) { finalStatus = 'target'; endIdx = i; break; }
          if (closes[i] < flagMin) { finalStatus = 'failed'; endIdx = i; break; }
        }
      }
      let score = 45 + Math.min(20, (polePct * 100 - 6) * 1.5) + (0.5 - Math.min(0.5, retrace)) * 30;
      if (volumeOk === true) score += 10;
      if (volumeOk === false) score -= 8;
      if (finalStatus === 'breakout' || finalStatus === 'target') score += 10;
      const detectIdx = t + minFlag;
      out.push({
        type: 'bull_flag', direction: 'bullish', status: finalStatus,
        base, top: t, end, breakIdx, endIdx, detectIdx,
        tBase: candles[base][T], tTop: candles[t][T], tEnd: candles[end][T],
        tBreak: breakIdx !== null ? candles[breakIdx][T] : null, tDetect: candles[Math.min(last, detectIdx)][T],
        poleLow: lows[base], poleHigh: highs[t], polePct: polePct * 100, retracePct: retrace * 100,
        upper: { i1: t, v1: upper.at(t), i2: Math.min(last, end + 1), v2: upper.at(Math.min(last, end + 1)) },
        lower: { i1: t + 1, v1: lower.at(t + 1), i2: end, v2: lower.at(end) },
        breakLevel, target, volumeOk,
        score: Math.round(clamp(score, 5, 99)),
      });
    }
    // Una bandera por mástil: si se solapan, la de mayor puntaje (o la más reciente).
    const kept = [];
    out.sort((a, b) => a.top - b.top).forEach((f) => {
      const clash = kept.find((k) => f.base <= k.end && f.top >= k.base);
      if (!clash) kept.push(f);
      else if (f.score > clash.score) kept.splice(kept.indexOf(clash), 1, f);
    });
    return kept.filter((f) => f.status !== 'expired');
  }

  // ------------------------------------------------------------- análisis
  const LABELS = {
    div_bull: 'Divergencia alcista', div_bull_hidden: 'Divergencia alcista oculta',
    div_bear: 'Divergencia bajista', div_bear_hidden: 'Divergencia bajista oculta',
    double_top: 'Doble techo', double_bottom: 'Doble suelo', bull_flag: 'Bandera alcista',
  };
  const STATUS = {
    forming: 'En formación', confirmed: 'Confirmado', invalidated: 'Invalidado', failed: 'Fallido',
    target: 'Objetivo alcanzado', breakout: 'Ruptura confirmada', active: 'Confirmada',
  };

  /**
   * Analiza velas (se descarta la última si todavía está abierta) y devuelve indicadores + señales.
   * @param {Array} candlesAll  velas [t,o,h,l,c,v]
   * @param {Object} o  { intervalMs, now, recentBars, coin, tf }
   */
  function analyze(candlesAll, o = {}) {
    const intervalMs = o.intervalMs || 4 * 3600 * 1000;
    const now = o.now || Date.now();
    let candles = candlesAll.filter((c) => c && isNum(c[C]));
    const lastOpen = candles.length && candles[candles.length - 1][T] + intervalMs > now;
    const forming = lastOpen ? candles[candles.length - 1] : null;
    if (lastOpen) candles = candles.slice(0, -1);
    const closes = col(candles, C);
    const rsiArr = rsi(closes, 14);
    const atrArr = atr(candles, 14);
    const lastIdx = candles.length - 1;
    const recent = o.recentBars ?? 42;              // 7 días en 4h
    const tf = o.tf || '4h';
    const coin = o.coin || '';

    const divs = rsiDivergences(candles, rsiArr, { warmup: o.warmup ?? Math.min(100, Math.floor(candles.length / 4)) });
    const doubles = doublePatterns(candles, atrArr, {});
    const flags = bullFlags(candles, atrArr, {});

    const signals = [];
    divs.forEach((d) => {
      const barsAgo = lastIdx - d.confirmIdx;
      signals.push(Object.assign({}, d, {
        id: `${coin}:${tf}:${d.type}:${d.t1}:${d.t2}`, label: LABELS[d.type], status: 'active',
        statusLabel: STATUS.active, eventIdx: d.confirmIdx, tEvent: d.tConfirm, barsAgo,
        recent: barsAgo <= recent, level: d.price2,
      }));
    });
    doubles.forEach((p) => {
      const eventIdx = p.breakIdx ?? p.detectIdx;
      const lastEventIdx = p.endIdx ?? eventIdx;
      signals.push(Object.assign({}, p, {
        id: `${coin}:${tf}:${p.type}:${p.t1}:${p.t2}`, label: LABELS[p.type], statusLabel: STATUS[p.status],
        eventIdx, tEvent: candles[eventIdx][T], barsAgo: lastIdx - lastEventIdx,
        recent: lastIdx - lastEventIdx <= recent, level: p.neckline,
      }));
    });
    flags.forEach((f) => {
      const eventIdx = f.breakIdx ?? Math.min(lastIdx, f.detectIdx);
      const lastEventIdx = f.endIdx ?? (f.status === 'forming' ? lastIdx : eventIdx);
      signals.push(Object.assign({}, f, {
        id: `${coin}:${tf}:${f.type}:${f.tTop}`, label: LABELS[f.type], statusLabel: STATUS[f.status],
        eventIdx, tEvent: candles[eventIdx][T], barsAgo: lastIdx - lastEventIdx,
        recent: lastIdx - lastEventIdx <= recent, level: f.breakLevel,
      }));
    });
    signals.sort((a, b) => b.tEvent - a.tEvent);
    const last = candles[lastIdx] || null;
    return {
      candles, forming, rsi: rsiArr, atr: atrArr, signals,
      lastClose: last ? last[C] : null, lastTime: last ? last[T] : null,
      rsiNow: rsiArr[lastIdx] ?? null,
      atrPct: last && atrArr[lastIdx] ? atrArr[lastIdx] / last[C] * 100 : null,
    };
  }

  // -------------------------------------------------------- pulso técnico (1D)
  function pulse(daily, o = {}) {
    const intervalMs = 86400000;
    const now = o.now || Date.now();
    let candles = daily.filter((c) => c && isNum(c[C]));
    if (candles.length && candles[candles.length - 1][T] + intervalMs > now) candles = candles.slice(0, -1);
    const closes = col(candles, C);
    const n = closes.length;
    if (n < 30) return null;
    const s50 = sma(closes, 50), s200 = sma(closes, 200), r = rsi(closes, 14);
    const close = closes[n - 1];
    const sma50 = s50[n - 1], sma200 = s200[n - 1];
    let cross = null;
    for (let i = n - 1; i > 0; i--) {
      if (s50[i] === null || s200[i] === null || s50[i - 1] === null || s200[i - 1] === null) break;
      const prev = s50[i - 1] - s200[i - 1], cur = s50[i] - s200[i];
      if (prev <= 0 && cur > 0) { cross = { type: 'golden', idx: i, t: candles[i][T], daysAgo: n - 1 - i }; break; }
      if (prev >= 0 && cur < 0) { cross = { type: 'death', idx: i, t: candles[i][T], daysAgo: n - 1 - i }; break; }
    }
    const rets30 = logReturns(closes.slice(-31));
    const sd = stdev(rets30);
    const w90 = candles.slice(-90);
    const lo90 = Math.min(...w90.map((c) => c[L])), hi90 = Math.max(...w90.map((c) => c[H]));
    let score = 0;
    if (sma50 !== null) score += close > sma50 ? 1 : -1;
    if (sma200 !== null) score += close > sma200 ? 1 : -1;
    if (sma50 !== null && sma200 !== null) score += sma50 > sma200 ? 1 : -1;
    const rsiNow = r[n - 1];
    if (rsiNow !== null) score += rsiNow >= 55 ? 1 : rsiNow <= 45 ? -1 : 0;
    const trend = sma50 === null || sma200 === null ? null
      : close > sma50 && sma50 > sma200 ? 'up' : close < sma50 && sma50 < sma200 ? 'down' : 'mixed';
    return {
      close, rsi14: rsiNow, sma50, sma200,
      dist50: sma50 ? (close / sma50 - 1) * 100 : null,
      dist200: sma200 ? (close / sma200 - 1) * 100 : null,
      cross, trend, vol30: sd !== null ? sd * Math.sqrt(365) * 100 : null,
      lo90, hi90, pos90: hi90 > lo90 ? (close - lo90) / (hi90 - lo90) : null,
      change30: n > 30 ? (close / closes[n - 31] - 1) * 100 : null,
      bias: score, biasLabel: score >= 2 ? 'Alcista' : score <= -2 ? 'Bajista' : 'Neutral',
      series: { closes, sma50: s50, sma200: s200, rsi: r, candles },
    };
  }

  return {
    sma, ema, rma, rsi, atr, stdev, logReturns, pearson, correlationMatrix, linreg,
    pivotHighs, pivotLows, rsiDivergences, doublePatterns, bullFlags, analyze, pulse,
    LABELS, STATUS,
  };
});
