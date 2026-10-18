// 国連 WPP 2024 の単歳生命表 → src/data/mortality.json
// 1950〜2023年は毎年 (戦争・飢饉・疫病の年の跳ね上がりを残す)、2024年以降の予測はなめらかなので5年ごと。
// qx を -ln(qx)×K の整数にし、同じ年齢の前の行との差で持つ (K=1000 で相対誤差 0.1%)
// 1900〜1945年 (WPP の前) は5年ごとに、ブラスのロジット関係モデルで作る (下の brass)。era.json を先に作っておくこと
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const root = new URL('../', import.meta.url);
const CODES = new Set(JSON.parse(readFileSync(new URL('src/data/countries.json', root), 'utf8')).map((c) => c.code));
const K = 1000, AGES = 100; // 0〜99歳 (100歳は「100歳以上」の開いた区間なので持たない)
const keep = (y) => y <= 2023 || y % 5 === 0;
const q = { F: {}, M: {} }; // sex → code → year → [qx]

for (const sex of ['Female', 'Male']) {
  for (const span of ['1950-2023', '2024-2100']) {
    const file = new URL(`data/raw/wpp/WPP2024_Life_Table_Complete_Medium_${sex}_${span}.csv.gz`, root);
    const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()) });
    let h;
    for await (const line of rl) {
      const r = line.split(',');
      if (!h) { h = Object.fromEntries(r.map((s, i) => [s.replace(/^﻿/, '').replace(/"/g, ''), i])); continue; }
      const code = r[h.ISO3_code], y = +r[h.Time], a = +r[h.AgeGrpStart];
      if (!CODES.has(code) || !keep(y) || a >= AGES) continue;
      ((q[sex[0]][code] ??= {})[y] ??= [])[a] = +r[h.qx];
    }
  }
}

// ---- 1900〜1945年: ブラスのロジット関係モデル ----
// その国の1950〜59年の WPP の表 (e0 が中央の年) を「形」にして、Y(x) = α + β·Ys(x) (Y = ½ln((1−l)/l)) で動かす。
// α は5歳までに亡くなる割合に、β は平均寿命に合わせる。5歳までの中の形 (0歳と1〜4歳の分け方) は「形」の表のまま (β=1)。
// 5歳未満を β で動かすと、平均寿命と子どもの死亡の組によっては、乳児の死が5歳未満の死の3割まで下がった (era.json の1950年より前の値。戦争・飢饉の年を除いた、ふだんの年の流れ)。
// 戦争・飢饉・疫病の死は worldevents.ts が別に足すので、ここには入れない
const era = JSON.parse(readFileSync(new URL('src/data/era.json', root), 'utf8'));
const PRE = era.years.filter((y) => y < 1950);
const lOf = (qs) => { const l = [1]; for (let a = 0; a < AGES; a++) l.push(l[a] * (1 - qs[a])); return l; };
const e0Of = (l) => { let e = 0; for (let a = 0; a < AGES; a++) e += (l[a] + l[a + 1]) / 2; return e + l[AGES] * 2; }; // 100歳から先はおよそ2年
// β は 0.6〜1.6 に収める (実際の生命表どうしの比べで見られる幅)。Gapminder の平均寿命と5歳未満死亡率がかみ合わない国・年
// (1930年のニカラグア: 5歳までに4割強が亡くなるのに平均寿命33年) は、β を端に置いたまま α を動かし、平均寿命の方に合わせる
const B_MIN = 0.6, B_MAX = 1.6;
function brass(std, e0, u5) {
  const Ys = lOf(std).map((l) => 0.5 * Math.log((1 - l) / l));
  const Y5 = 0.5 * Math.log(u5 / (1 - u5));
  const make = (b, shift = 0) => [1, ...Ys.slice(1).map((Y, i) => 1 / (1 + Math.exp(2 * (Y5 + shift + (i + 1 < 5 ? 1 : b) * (Y - Ys[5])))))];
  // 大きいほど e0 が小さくなる値 x を、e0 に合うまで二分する
  const solve = (f, lo, hi) => { for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (e0Of(f(mid)) > e0) lo = mid; else hi = mid; } return f((lo + hi) / 2); };
  const l = e0Of(make(B_MIN)) < e0 ? solve((s) => make(B_MIN, s), -5, 5)
    : e0Of(make(B_MAX)) > e0 ? solve((s) => make(B_MAX, s), -5, 5)
      : solve((b) => make(b), B_MIN, B_MAX);
  return l.slice(0, AGES).map((v, a) => 1 - l[a + 1] / v);
}
for (const code of CODES) {
  const d = era.countries[code];
  // 「形」にする年: 1950〜59年のうち、男女の e0 の和が中央の年 (朝鮮戦争の年のような表を避ける)
  const std = {};
  const by = Array.from({ length: 10 }, (_, i) => 1950 + i).map((y) => [y, e0Of(lOf(q.F[code][y])) + e0Of(lOf(q.M[code][y]))]).sort((a, b) => a[1] - b[1])[5][0];
  for (const s of ['F', 'M']) std[s] = q[s][code][by];
  // 5歳までの死亡の男女の比も、その年の表のまま
  const u5s = { F: 1 - lOf(std.F)[5], M: 1 - lOf(std.M)[5] };
  const k = { F: u5s.F / ((u5s.F + u5s.M) / 2), M: u5s.M / ((u5s.F + u5s.M) / 2) };
  for (const y of PRE) {
    const i = era.years.indexOf(y);
    for (const s of ['F', 'M']) q[s][code][y] = brass(std[s], d[s === 'F' ? 'leF' : 'leM'][i], Math.min(0.7, d.u5mr[i] * k[s]));
  }
  // 1949年の行: 1945年と1950年の間は対数の上で直線に埋めるので、1950年が戦争の年の国 (朝鮮戦争の韓国: 男の e0 17.5年) では、
  // 1946〜49年が戦争の死亡率に引っぱられていた (1949年の男の e0 が約21年)。その国だけ、1950年の代わりに「形」の表 (1950年代の中央の年、韓国は1954年) へ向けて、その年までの4年分を埋める。
  // 戦争の年とみるのは、1950年から1955年に男女とも平均して11年より e0 が上がった国 (build-era.mjs の LE_PACE の2倍。韓国は22年分上がった)。
  // ほかの国は、これまでと同じ直線の上の値
  const sum = (y) => e0Of(lOf(q.F[code][y])) + e0Of(lOf(q.M[code][y]));
  const war = sum(1955) - sum(1950) > 2 * 11;
  for (const s of ['F', 'M']) {
    const [to, t] = war ? [std[s], 4 / (by - 1945)] : [q[s][code][1950], 0.8];
    q[s][code][1949] = q[s][code][1945].map((v, a) => Math.exp(Math.log(v) * (1 - t) + Math.log(to[a]) * t));
  }
}

const years = Object.keys(q.F.JPN).map(Number).sort((a, b) => a - b);
const out = { K, years, ages: AGES, countries: {} };
for (const code of CODES) {
  const c = {};
  for (const s of ['F', 'M']) {
    const ys = q[s][code];
    if (!ys || years.some((y) => ys[y]?.length !== AGES)) throw new Error(`missing ${code} ${s}`);
    let prev = new Array(AGES).fill(0);
    const flat = [];
    for (const y of years) {
      const cur = ys[y].map((v) => Math.round(-Math.log(Math.max(v, 1e-6)) * K));
      flat.push(...cur.map((v, i) => v - prev[i]));
      prev = cur;
    }
    c[s] = flat;
  }
  out.countries[code] = c;
}
writeFileSync(new URL('src/data/mortality.json', root), JSON.stringify(out));
console.log('years', years.length, `${years[0]}..${years.at(-1)}`, 'countries', Object.keys(out.countries).length);
