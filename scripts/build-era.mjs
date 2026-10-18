// 国×年の統計 (1900〜2100年、5年ごと) → src/data/era.json
// countries.json (最新の1年) の国と指標をそのまま年の軸に広げる。値の出どころは指標ごとに3つ:
//  1. 国連 WPP 2024 (出生数・人口・平均寿命・乳児/5歳未満死亡率・合計特殊出生率)。2024年以降は WPP の中位推計
//     1950年より前 (WPP の前) は Gapminder の長い系列 (平均寿命・5歳未満死亡率・人口・出生率) を、1950年の WPP に継ぎ目なくつなぐ (下の 1b)
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
const Y0 = 1900, Y1 = 2100, STEP = 5, NOW = 2023;
const WPP0 = 1950; // WPP の最初の年。これより前は推定
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
  const C = { code: col('ISO3_code'), t: col('Time'), births: col('Births'), pop: col('TPopulation1July'), le: col('LEx'), leF: col('LExFemale'), leM: col('LExMale'), imr: col('IMR'), u5: col('Q5'), tfr: col('TFR') };
  for (const r of rows.slice(1)) {
    const code = r[C.code], y = +r[C.t];
    // 1950〜59年は毎年 (1950年より前をつなぐ「継ぎ目」に使う)
    if (!CODES.has(code) || (y % STEP && y > WPP0 + 9)) continue;
    (wpp[code] ??= {})[y] = {
      births: +r[C.births] * 1000, pop: +r[C.pop] * 1000, le: +r[C.le], leF: +r[C.leF], leM: +r[C.leM],
      imr: +r[C.imr] / 1000, u5mr: +r[C.u5] / 1000, tfr: +r[C.tfr],
    };
  }
}

// ---- 2. Gapminder GDP ----
const gm = {}; // code → year → gdp
for (const [k, y, v] of csv(read('data/raw/gapminder/gdp_pcap.csv')).slice(1)) (gm[k.toUpperCase()] ??= {})[+y] = +v;

// ---- 1b. 1900〜1949年 (WPP の前): Gapminder の長い系列 ----
// 平均寿命 (男女計)・5歳未満死亡率・人口・合計特殊出生率。162か国すべてに1900年の値がある (無ければ止める)
const gmLong = {}; // key → code → year → v
for (const key of ['lex', 'u5mr', 'pop', 'tfr']) {
  gmLong[key] = {};
  for (const [k, y, v] of csv(read(`data/raw/gapminder/${key}.csv`)).slice(1)) if (+y >= 1880 && +y <= 1965) (gmLong[key][k.toUpperCase()] ??= {})[+y] = +v;
}
// 戦争・飢饉・疫病の年を除いた「ふだんの年」の流れ。その年の死は worldevents.ts が別に足すので、ここに残すと二重に数える。
// 2つの世界大戦とスペイン風邪の年 (1914〜19年・1939〜46年) はどの国も外し、前後の年の間を埋める。
// そのほかの国ごとの危機 (1921年のロシア、1933年のウクライナ、1943年のベンガルなど) は、前後8年の直線から下へ
// (死亡率なら上へ) 外れた年を外すのを4回繰り返して見つける。寿命は 2.5年、5歳未満死亡率は対数で 0.15 (約16%) 外れたら危機とみなす。
// 残った年の前後5年の直線で、その年の値を読む (片側にしか年が残っていなければ、その平均)
const WARS = [[1914, 1919], [1939, 1946]];
function calm(s, worseUp) {
  const z = (v) => (worseUp ? -Math.log(v) : v);
  const TOL = worseUp ? 0.15 : 2.5;
  const ys = Object.keys(s).map(Number).filter((y) => !WARS.some(([a, b]) => y >= a && y <= b)).sort((a, b) => a - b);
  const fit = (pts, x) => {
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxy = 0, sxx = 0;
    for (const [px, py] of pts) { sxy += (px - mx) * (py - my); sxx += (px - mx) ** 2; }
    return my + (sxx ? sxy / sxx : 0) * (x - mx);
  };
  let kept = ys;
  for (let it = 0; it < 4; it++) {
    const prev = kept;
    kept = ys.filter((y) => z(s[y]) >= fit(prev.filter((x) => Math.abs(x - y) <= 8).map((x) => [x, z(s[x])]), y) - TOL);
  }
  return (y) => {
    let w = kept.filter((x) => Math.abs(x - y) <= 5);
    if (w.length < 3 || !w.some((x) => x < y) || !w.some((x) => x > y)) w = kept.filter((x) => Math.abs(x - y) <= 10);
    const pts = w.map((x) => [x, z(s[x])]);
    const v = w.some((x) => x < y) && w.some((x) => x > y) ? fit(pts, y) : pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return worseUp ? Math.exp(-v) : v;
  };
}
const median = (xs) => { const a = [...xs].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
// WPP の1950〜59年の中央値 (朝鮮戦争の1950〜53年のような年があっても、継ぎ目がその年に引っぱられない)
const wppMid = (w, f) => median(Array.from({ length: 10 }, (_, i) => f(w[WPP0 + i])));
// 1950年より前の値。Gapminder と WPP の1950年代の差を、1900年の0から1950年の全部へ直線で効かせる
// (1900年は Gapminder のまま、1950年の WPP へはおおむね段差なくつながる)。
// 差は1950年代の中央値どうしで測る (1950年が戦争の年の国: 朝鮮戦争の韓国は、Gapminder の1950年の出生率が4.0で、WPP は6.1)
// 1950年に向かう最後の何年かは、上がり方を 1950〜60年の WPP で速いほうから5%の国の速さまでにする
// (平均寿命 年1.1年・5歳未満死亡率 年8%)。Gapminder は年の飛んだ推計の間を直線で埋めていて、
// レバノンは1940年の28.8年から1950年の57.4年へ毎年2.9年ずつ、イスラエル (委任統治領パレスチナ) は毎年2.3年ずつ上がっていた。
// そのまま継ぐと、1945年から1950年の5年で平均寿命が15年跳ねた。
// 逆に、1950年より前の「ふだんの年」が1950年より良いこともないようにする (イラクは1945年44.4年 → 1950年41.0年 → 1955年48.5年と、谷になっていた)。
// ただし1950年から1955年に平均寿命が上の速さの2倍 (11年) より上がった国 (朝鮮戦争の韓国、22年 → 48年) は、1950年が戦争の年なので、その年には合わせない。
// 5歳未満死亡率は、1950年が1950年代の中央値の1.5倍を超える国 (韓国) をそう見る
const LE_PACE = 1.1, U5_PACE = 0.08;
function before1950(code, w) {
  const g = (key) => { const s = gmLong[key][code]; if (!s?.[1900] || !s[1955]) throw new Error(`gapminder ${key} ${code}`); return s; };
  const lex = calm(g('lex'), false), u5 = calm(g('u5mr'), true);
  const pop = g('pop'), tfr = g('tfr');
  const k = (y) => (y - 1900) / 50;
  const gmMid = (s) => median(Array.from({ length: 10 }, (_, i) => s(WPP0 + i)));
  const leD = wppMid(w, (r) => r.le) - gmMid(lex);
  const leTop = w[WPP0 + 5].le - w[WPP0].le > 2 * LE_PACE * 5 ? Infinity : w[WPP0].le;
  const le = (y) => Math.min(leTop, Math.max(lex(y) + leD * k(y), w[WPP0].le - LE_PACE * (WPP0 - y)));
  const fF = wppMid(w, (r) => r.leF / r.le), fM = wppMid(w, (r) => r.leM / r.le); // 男女の差は1950年代初めの比のまま
  // 5歳未満死亡率の継ぎ目の比は 2/3〜1.5倍まで (ニカラグアは Gapminder が WPP の半分以下で、そのまま延ばすと1925年に75%になった)
  const u5K = Math.min(1.5, Math.max(2 / 3, wppMid(w, (r) => r.u5mr) / (gmMid(u5) / 1000)));
  const u5Low = Math.min(w[WPP0].u5mr, wppMid(w, (r) => r.u5mr) * 1.5);
  const u5mr = (y) => Math.max(u5Low, Math.min(u5(y) / 1000 * u5K ** k(y), w[WPP0].u5mr * Math.exp(U5_PACE * (WPP0 - y))));
  const imrK = wppMid(w, (r) => r.imr / r.u5mr);
  const popAt = (y) => pop[y] * (w[WPP0].pop / pop[WPP0]) ** ((y - 1900) / 50);
  const tfrAt = (y) => tfr[y] * (wppMid(w, (r) => r.tfr) / gmMid((x) => tfr[x])) ** ((y - 1900) / 50);
  const cbr = w[WPP0].births / w[WPP0].pop;
  return (y) => ({
    leF: le(y) * fF, leM: le(y) * fM, u5mr: u5mr(y), imr: u5mr(y) * imrK,
    pop: popAt(y), tfr: tfrAt(y), births: popAt(y) * cbr * tfrAt(y) / w[WPP0].tfr, // 出生率は合計特殊出生率に比例させる
  });
}

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
  elec: ['electricity', (v) => v / 100, 'logit', 1], // 電気が使える人の割合 (世界銀行、1990年〜)
};
const points = {}; // key → code → [[year, v]]
for (const [key, [file, fn]] of Object.entries(OWID)) {
  points[key] = {};
  for (const r of csv(read(`data/raw/${file}.csv`)).slice(1)) {
    const [, code, ys, vs] = r;
    if (!CODES.has(code) || vs === '' || vs === undefined || +ys < Y0 || +ys > 2024) continue; // 就学年数は1870年からある (Lee-Lee)
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
  // countries.json に無い指標 (電気) は、その国の実測の最後の値を使う
  const latest = (c) => c[key] ?? points[key][c.code]?.at(-1)?.[1];
  for (const c of countries) if (!(c.est ?? []).includes(key) && latest(c) !== undefined) { xs.push(Math.log(c.gdp)); ys.push(f(latest(c))); }
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  beta[key] = sxy / sxx;
}
// 所得との関係だけでは時代の流れを外すもの: 喫煙は昔ほど多く (1965年の米国42% → 2000年23%)、HIV は1981年より前は無い
// 喫煙の傾きは豊かな国の経験で、さかのぼるのは20年まで (それより前は多くの国で、まだ広がる途中だった)
const TREND = { smoke: -0.025 }; // ロジットの上で1年あたり (過去へ戻ると増える)
const TREND_YEARS = 20;
const ELEC_CAP = [[1900, 0.05], [1905, 0.07], [1910, 0.15], [1915, 0.25], [1920, 0.35], [1925, 0.53], [1930, 0.68], [1935, 0.72], [1940, 0.79], [1945, 0.85]];

function series(c, key) {
  const [, , shape, cap] = OWID[key];
  const f = fwd(shape, cap), g = back(shape, cap);
  const pts = points[key][c.code]?.length ? points[key][c.code] : [[NOW, c[key] ?? 1]];
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
    // 1950年より前の電気は、所得だけで延ばすと多すぎる (1900年の米国の所得は今の中所得国と同じだが、電気の来た家は1割未満)。
    // 米国の家庭の電化率 (1907年8%・1920年35%・1930年68%・1940年79%、米国勢調査局 Historical Statistics) を上限にする
    if (key === 'elec' && y < WPP0) v = Math.min(v, ELEC_CAP.find(([cy]) => cy >= y)[1]);
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
  const old = before1950(c.code, w);
  for (const k of ['births', 'pop', 'leF', 'leM', 'imr', 'u5mr', 'tfr']) d[k] = YEARS.map((y) => round(y < WPP0 ? old(y)[k] : w[y][k]));
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
for (const code of ['JPN', 'NGA', 'CHN', 'IND', 'GBR']) {
  const d = out.countries[code];
  const at = (y) => YEARS.indexOf(y);
  console.log(code, [1900, 1925, 1945, 1950, 1980, 2000, 2025, 2050, 2100].map((y) => `${y}: e0 ${d.leF[at(y)]}/${d.leM[at(y)]} u5 ${d.u5mr[at(y)]} gdp ${Math.round(d.gdp[at(y)])} sch ${d.school[at(y)].toFixed(1)} agri ${d.agri[at(y)].toFixed(2)} cm ${d.childMarriage[at(y)].toFixed(2)} smk ${d.smoke[at(y)].toFixed(2)}`).join('\n  '));
}
