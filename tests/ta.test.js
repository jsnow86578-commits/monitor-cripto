/* Pruebas del motor técnico: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const TA = require('../assets/js/ta.js');

const H4 = 4 * 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1);

/** Construye velas a partir de cierres con mecha fija (±pct). */
function candlesFrom(closes, wick = 0.005, vols) {
  return closes.map((c, i) => {
    const o = i ? closes[i - 1] : c;
    const hi = Math.max(o, c) * (1 + wick), lo = Math.min(o, c) * (1 - wick);
    return [T0 + i * H4, o, hi, lo, c, vols ? vols[i] : 1000];
  });
}
function path(start, steps) {          // steps: [[n, pctPorVela], ...]
  const out = [start];
  steps.forEach(([n, pct]) => { for (let i = 0; i < n; i++) out.push(out[out.length - 1] * (1 + pct)); });
  return out;
}
function wobble(n, base, amp = 0.004) {  // lateral suave para "calentar" indicadores
  return Array.from({ length: n }, (_, i) => base * (1 + amp * Math.sin(i / 2.3)));
}

test('RSI(14) coincide con la tabla de referencia de Wilder/StockCharts', () => {
  const closes = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931,
    46.0328, 45.6140, 46.2820, 46.2820, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521, 45.7137,
    46.4515, 45.7835, 45.3548, 44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314];
  const expected = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46,
    41.87, 45.46, 37.30, 33.08, 37.77];
  const r = TA.rsi(closes, 14);
  assert.equal(r[13], null);
  expected.forEach((v, k) => assert.ok(Math.abs(r[14 + k] - v) < 0.06, `RSI[${14 + k}] = ${r[14 + k]} ≠ ${v}`));
});

test('SMA / EMA básicos', () => {
  assert.deepEqual(TA.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const e = TA.ema([1, 2, 3, 4, 5, 6], 3);
  assert.equal(e[2], 2);
  assert.ok(Math.abs(e[5] - 5) < 1e-9);
});

test('pivotes altos y bajos', () => {
  const s = [1, 2, 5, 2, 1, 0, 1, 3, 1];
  assert.deepEqual(TA.pivotHighs(s, 2, 2), [2]);
  assert.deepEqual(TA.pivotLows(s, 2, 2), [5]);
});

test('detecta divergencia alcista regular (precio LL, RSI HL)', () => {
  const closes = [
    ...wobble(130, 100),
    ...path(100, [[8, -0.025]]).slice(1),      // caída fuerte → RSI muy bajo
    ...[], // placeholder
  ];
  let c = closes;
  c = c.concat(path(c[c.length - 1], [[9, 0.012]]).slice(1));   // rebote
  c = c.concat(path(c[c.length - 1], [[14, -0.009]]).slice(1)); // caída lenta a un mínimo menor
  c = c.concat(path(c[c.length - 1], [[12, 0.01]]).slice(1));   // rebote final
  const candles = candlesFrom(c);
  const r = TA.rsi(c, 14);
  const divs = TA.rsiDivergences(candles, r, {});
  const bull = divs.filter((d) => d.type === 'div_bull');
  assert.ok(bull.length >= 1, 'no se detectó la divergencia alcista');
  const d = bull[bull.length - 1];
  assert.ok(d.price2 < d.price1 && d.rsi2 > d.rsi1);
  assert.ok(d.i1 >= 130 && d.i1 <= 140, `i1=${d.i1}`);
});

test('detecta doble techo confirmado con objetivo medido', () => {
  let c = wobble(40, 70);
  c = c.concat(path(70, [[36, 0.01]]).slice(1));                // tendencia alcista previa
  const top = c[c.length - 1];
  c = c.concat(path(top, [[10, -0.0085]]).slice(1));            // baja a la neckline
  c = c.concat(path(c[c.length - 1], [[10, 0.0087]]).slice(1)); // segundo techo similar
  c = c.concat(path(c[c.length - 1], [[16, -0.009]]).slice(1)); // ruptura bajista
  const candles = candlesFrom(c, 0.004);
  const atr = TA.atr(candles, 14);
  const pats = TA.doublePatterns(candles, atr, {});
  const dt = pats.filter((p) => p.type === 'double_top');
  assert.ok(dt.length >= 1, 'no se detectó el doble techo');
  const p = dt[dt.length - 1];
  assert.ok(['confirmed', 'target'].includes(p.status), `estado ${p.status}`);
  assert.ok(p.target < p.neckline);
});

test('detecta doble suelo confirmado', () => {
  let c = wobble(40, 140);
  c = c.concat(path(140, [[36, -0.01]]).slice(1));
  const bottom = c[c.length - 1];
  c = c.concat(path(bottom, [[10, 0.009]]).slice(1));
  c = c.concat(path(c[c.length - 1], [[10, -0.0089]]).slice(1));
  c = c.concat(path(c[c.length - 1], [[16, 0.009]]).slice(1));
  const candles = candlesFrom(c, 0.004);
  const pats = TA.doublePatterns(candles, TA.atr(candles, 14), {});
  const db = pats.filter((p) => p.type === 'double_bottom');
  assert.ok(db.length >= 1, 'no se detectó el doble suelo');
  assert.ok(['confirmed', 'target'].includes(db[db.length - 1].status));
});

test('detecta bandera alcista con ruptura y volumen decreciente', () => {
  let c = wobble(60, 100, 0.003);
  c = c.concat(path(100, [[6, 0.024]]).slice(1));               // mástil ~+15%
  c = c.concat(path(c[c.length - 1], [[10, -0.0045]]).slice(1)); // bandera bajista suave
  c.push(c[c.length - 1] * 1.035);                               // ruptura
  c = c.concat(path(c[c.length - 1], [[3, 0.004]]).slice(1));
  const vols = c.map((_, i) => (i > 60 && i <= 66 ? 5000 : i > 66 && i <= 76 ? 1500 : 2000));
  const candles = candlesFrom(c, 0.003, vols);
  const flags = TA.bullFlags(candles, TA.atr(candles, 14), {});
  assert.ok(flags.length >= 1, 'no se detectó la bandera');
  const f = flags[flags.length - 1];
  assert.ok(['breakout', 'target'].includes(f.status), `estado ${f.status}`);
  assert.equal(f.volumeOk, true);
  assert.ok(f.retracePct < 50);
});

test('bandera en formación se reporta sin ruptura', () => {
  let c = wobble(60, 100, 0.003);
  c = c.concat(path(100, [[6, 0.024]]).slice(1));
  c = c.concat(path(c[c.length - 1], [[7, -0.004]]).slice(1));
  const candles = candlesFrom(c, 0.003);
  const flags = TA.bullFlags(candles, TA.atr(candles, 14), {});
  assert.ok(flags.some((f) => f.status === 'forming'), JSON.stringify(flags.map((f) => f.status)));
});

test('analyze descarta la vela abierta y arma ids estables', () => {
  let c = wobble(200, 1);
  const candles = candlesFrom(c);
  const now = candles[candles.length - 1][0] + 3600 * 1000;        // última vela aún abierta
  const a = TA.analyze(candles, { now, coin: 'xrp', tf: '4h' });
  assert.equal(a.candles.length, candles.length - 1);
  assert.ok(a.forming);
  a.signals.forEach((s) => assert.ok(s.id.startsWith('xrp:4h:')));
});

test('pulso diario: tendencia, cruce y volatilidad', () => {
  const D = 86400000;
  let c = path(1, [[150, -0.003], [120, 0.006]]);
  const candles = c.map((v, i) => [T0 + i * D, v, v * 1.01, v * 0.99, v, 1]);
  const p = TA.pulse(candles, { now: T0 + c.length * D + 1 });
  assert.equal(p.trend, 'up');
  assert.equal(p.cross.type, 'golden');
  assert.ok(p.vol30 >= 0);
  assert.equal(p.biasLabel, 'Alcista');
});

test('matriz de correlación', () => {
  const D = 86400000;
  const a = [], b = [], z = [];
  for (let i = 0; i < 120; i++) {
    const v = 100 * Math.exp(0.02 * Math.sin(i * 1.7) + i * 0.001);
    a.push([T0 + i * D, v]); b.push([T0 + i * D, v * 2]); z.push([T0 + i * D, 100 * Math.exp(0.02 * Math.cos(i * 0.9))]);
  }
  const { matrix } = TA.correlationMatrix({ a, b, z }, 90);
  assert.ok(Math.abs(matrix.a.b - 1) < 1e-9);
  assert.ok(Math.abs(matrix.a.z) < 0.9);
});
