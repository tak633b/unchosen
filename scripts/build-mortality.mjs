// 国連 WPP 2024 の単歳生命表 → src/data/mortality.json
// 1950〜2023年は毎年 (戦争・飢饉・疫病の年の跳ね上がりを残す)、2024年以降の予測はなめらかなので5年ごと。
// qx を -ln(qx)×K の整数にし、同じ年齢の前の行との差で持つ (K=1000 で相対誤差 0.1%)
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
