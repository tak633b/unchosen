// 国×年の統計 (1950〜2100年、5年ごと) → src/data/era.json
// countries.json (最新の1年) の国と指標をそのまま年の軸に広げる。値の出どころは指標ごとに3つ:
//  1. 国連 WPP 2024 (出生数・人口・平均寿命・乳児/5歳未満死亡率・合計特殊出生率)。2024年以降は WPP の中位推計
//  2. Gapminder の1人当たりGDP (2100年まで。2024年以降は Gapminder の予測)。今の値との比で延ばす
//  3. OWID の実測 (年がまばら)。実測の年の間は直線で埋め、範囲の外は「所得との関係」で延ばす:
//     実測の端の値から、ロジット (または対数) の上で β × (log GDP の差) だけ動かす。β は国どうしの比較 (最新の年) から求める
// 各指標の実測の範囲 [最初の年, 最後の年] を obs に残す。範囲の外は推定、2024年以降は予測として画面に出す
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const countries = JSON.parse(read('src/data/countries.json'));
const CODES = new Set(countries.map((c) => c.code));
const Y0 = 1950, Y1 = 2100, STEP = 5, NOW = 2023;
const YEARS = Array.from({ length: (Y1 - Y0) / STEP + 1 }, (_, i) => Y0 + i * STEP);

function csv(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const cells = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

// ---- 1. WPP ----
const wpp = {}; // code → year → row
{
  const rows = csv(gunzipSync(readFileSync(new URL('data/raw/wpp/WPP2024_Demographic_Indicators_Medium.csv.gz', root))).toString('utf8'));
  const h = rows[0].map((s) => s.replace(/^﻿/, ''));
  const col = (n) => h.indexOf(n);
  const C = { code: col('ISO3_code'), t: col('Time'), births: col('Births'), pop: col('TPopulation1July'), leF: col('LExFemale'), leM: col('LExMale'), imr: col('IMR'), u5: col('Q5'), tfr: col('TFR') };
  for (const r of rows.slice(1)) {
    const code = r[C.code], y = +r[C.t];
    if (!CODES.has(code) || y % STEP) continue;
    (wpp[code] ??= {})[y] = {
      births: +r[C.births] * 1000, pop: +r[C.pop] * 1000, leF: +r[C.leF], leM: +r[C.leM],
      imr: +r[C.imr] / 1000, u5mr: +r[C.u5] / 1000, tfr: +r[C.tfr],
    };
  }
}

// ---- 2. Gapminder GDP ----
const gm = {}; // code → year → gdp
for (const [k, y, v] of csv(read('data/raw/gapminder/gdp_pcap.csv')).slice(1)) (gm[k.toUpperCase()] ??= {})[+y] = +v;

// ---- 3. OWID のまばらな実測 ----
const OWID = {
  // key: [ファイル, 変換, 形 (logit は 0..cap の割合、log は正の値), cap]
  gini: ['gini', (v) => v, 'logit', 1],
  school: ['schooling', (v) => v, 'logit', 16],
  tertiary: ['tertiary', (v) => v / 100, 'logit', 1.2],
  agri: ['agriculture', (v) => v / 100, 'logit', 1],
  mmr: ['maternal', (v) => v, 'log'],
  hiv: ['hiv', (v) => v / 100, 'logit', 1],
  homicide: ['homicide', (v) => v, 'log'],
  smoke: ['smoking', (v) => v / 100, 'logit', 1],
  oop: ['oop', (v) => v / 100, 'logit', 1],
  childMarriage: ['childMarriage', (v) => v / 100, 'logit', 1],
  happiness: ['happiness', (v) => v, 'logit', 10],
  flfp: ['flfp', (v) => v / 100, 'logit', 1],
};
const points = {}; // key → code → [[year, v]]
for (const [key, [file, fn]] of Object.entries(OWID)) {
  points[key] = {};
  for (const r of csv(read(`data/raw/${file}.csv`)).slice(1)) {
    const [, code, ys, vs] = r;
    if (!CODES.has(code) || vs === '' || vs === undefined || +ys < Y0 || +ys > 2024) continue;
    (points[key][code] ??= []).push([+ys, fn(+vs)]);
  }
  for (const list of Object.values(points[key])) list.sort((a, b) => a[0] - b[0]);
}

const fwd = (shape, cap) => (v) => shape === 'log' ? Math.log(Math.max(v, 1e-6)) : (() => { const x = Math.min(Math.max(v / cap, 1e-4), 1 - 1e-4); return Math.log(x / (1 - x)); })();
const back = (shape, cap) => (z) => shape === 'log' ? Math.exp(z) : cap / (1 + Math.exp(-z));

// GDP の年の軸: Gapminder の形を、countries.json の今の値に合わせる
const gdpAt = (c, y) => {
  const s = gm[c.code];
  if (!s?.[y] || !s[NOW]) return c.gdp;
  return c.gdp * s[y] / s[NOW];
};

// 国どうしの比較から β: 変換した値 ~ a + β log GDP の最小二乗 (実測のある国だけ)
const beta = {};
for (const [key, [, , shape, cap]] of Object.entries(OWID)) {
  const f = fwd(shape, cap);
  const xs = [], ys = [];
  for (const c of countries) if (!(c.est ?? []).includes(key)) { xs.push(Math.log(c.gdp)); ys.push(f(c[key])); }
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  beta[key] = sxy / sxx;
}
// 所得との関係だけでは時代の流れを外すもの: 喫煙は昔ほど多く (1965年の米国42% → 2000年23%)、HIV は1981年より前は無い
// 喫煙の傾きは豊かな国の経験で、さかのぼるのは20年まで (それより前は多くの国で、まだ広がる途中だった)
const TREND = { smoke: -0.025 }; // ロジットの上で1年あたり (過去へ戻ると増える)
const TREND_YEARS = 20;

function series(c, key) {
  const [, , shape, cap] = OWID[key];
  const f = fwd(shape, cap), g = back(shape, cap);
  const pts = points[key][c.code]?.length ? points[key][c.code] : [[NOW, c[key]]];
  const out = [];
  for (const y of YEARS) {
    const first = pts[0], last = pts[pts.length - 1];
    let v;
    if (y < first[0] || y > last[0]) {
      const [ya, va] = y < first[0] ? first : last;
      const z = f(va) + beta[key] * (Math.log(gdpAt(c, y)) - Math.log(gdpAt(c, ya))) + (TREND[key] ?? 0) * Math.max(-TREND_YEARS, y - ya);
      v = g(z);
    } else {
      const i = pts.findIndex(([py]) => py >= y);
      const [y1, v1] = pts[i];
      const [y0, v0] = pts[Math.max(0, i - 1)];
      v = y1 === y0 ? v1 : v0 + (v1 - v0) * (y - y0) / (y1 - y0);
    }
    // HIV の最初の報告は1981年。最初の実測までは 1981年の0から直線で増やす
    if (key === 'hiv' && y < pts[0][0]) v = Math.max(0, pts[0][1] * (y - 1981) / (pts[0][0] - 1981));
    out.push(v);
  }
  return { v: out, obs: points[key][c.code]?.length ? [pts[0][0], pts[pts.length - 1][0]] : null };
}

const round = (v) => +(+v).toPrecision(4);
const out = { years: YEARS, now: NOW, beta: Object.fromEntries(Object.entries(beta).map(([k, b]) => [k, round(b)])), countries: {} };
let missing = 0;
for (const c of countries) {
  const d = {};
  const w = wpp[c.code];
  if (!w) { missing++; continue; }
  for (const k of ['births', 'pop', 'leF', 'leM', 'imr', 'u5mr', 'tfr']) d[k] = YEARS.map((y) => round(w[y][k]));
  d.gdp = YEARS.map((y) => round(gdpAt(c, y)));
  const obs = {};
  for (const key of Object.keys(OWID)) {
    const s = series(c, key);
    d[key] = s.v.map(round);
    if (s.obs) obs[key] = s.obs;
  }
  d.obs = obs;
  out.countries[c.code] = d;
}
writeFileSync(new URL('src/data/era.json', root), JSON.stringify(out));
console.log('countries', Object.keys(out.countries).length, 'missing WPP', missing, 'beta', out.beta);
for (const code of ['JPN', 'NGA', 'CHN', 'IND']) {
  const d = out.countries[code];
  const at = (y) => YEARS.indexOf(y);
  console.log(code, [1950, 1980, 2000, 2025, 2050, 2100].map((y) => `${y}: e0 ${d.leF[at(y)]}/${d.leM[at(y)]} u5 ${d.u5mr[at(y)]} gdp ${Math.round(d.gdp[at(y)])} sch ${d.school[at(y)].toFixed(1)} agri ${d.agri[at(y)].toFixed(2)} cm ${d.childMarriage[at(y)].toFixed(2)} smk ${d.smoke[at(y)].toFixed(2)}`).join('\n  '));
}
