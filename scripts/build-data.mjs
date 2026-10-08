// data/raw/*.csv → src/data/countries.json
// 各指標は 2024 年以前で最新の値を採る。欠けている指標は同じ地域の出生数加重平均で埋め、埋めたものを est に記録する。
import { readFileSync, writeFileSync } from 'node:fs';
import countries from 'i18n-iso-countries';
import ja from 'i18n-iso-countries/langs/ja.json' with { type: 'json' };
import en from 'i18n-iso-countries/langs/en.json' with { type: 'json' };

countries.registerLocale(ja);
countries.registerLocale(en);
const raw = (k) => readFileSync(new URL(`../data/raw/${k}.csv`, import.meta.url), 'utf8');

function parseCsv(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const cells = [];
    let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

// 指標名 → [ファイル, 列番号, 変換]
const SPEC = {
  births: ['births', 3],
  pop: ['population', 3],
  leF: ['lifeExp', 3],
  leM: ['lifeExp', 4],
  imr: ['infant', 3, (v) => v / 100],        // 出生100あたり → 確率
  u5mr: ['under5', 3, (v) => v / 100],       // % → 確率
  gdp: ['gdp', 3],                           // 1人当たりGDP 購買力平価 (2021年国際ドル)
  gini: ['gini', 3],                         // 0–1
  school: ['schooling', 3],                  // 15–64歳の平均教育年数
  tertiary: ['tertiary', 3, (v) => v / 100], // 高等教育総就学率
  agri: ['agriculture', 3, (v) => v / 100],
  tfr: ['fertility', 3],
  mmr: ['maternal', 3],                      // 出生10万あたり
  hiv: ['hiv', 3, (v) => v / 100],           // 15–49歳の有病率
  homicide: ['homicide', 3],                 // 人口10万あたり
  smoke: ['smoking', 3, (v) => v / 100],
  oop: ['oop', 3, (v) => v / 100],           // 医療費のうち自己負担の割合
  childMarriage: ['childMarriage', 3, (v) => v / 100],
  happiness: ['happiness', 3],
  flfp: ['flfp', 3, (v) => v / 100],        // 15歳以上の女性の労働参加率 (ILO)
};
const REQUIRED = ['births', 'pop', 'leF', 'leM', 'u5mr', 'gdp'];
const MAX_YEAR = 2024;

const cache = {};
const table = (file) => (cache[file] ??= parseCsv(raw(file)).slice(1));

const byCode = {};
const regionOf = {};
for (const [key, [file, col, fn = (v) => v]] of Object.entries(SPEC)) {
  const best = {};
  for (const r of table(file)) {
    const [, code, yearS] = r;
    const year = +yearS, v = r[col];
    if (!code || code.length !== 3 || year > MAX_YEAR || v === '' || v === undefined) continue;
    if (!best[code] || best[code].year < year) best[code] = { year, v: fn(+v) };
  }
  for (const [code, { v }] of Object.entries(best)) (byCode[code] ??= {})[key] = v;
}
for (const file of ['lifeExp', 'gdp', 'homicide', 'maternal', 'childMarriage']) {
  for (const r of table(file)) {
    const region = r.find((c, i) => i > 2 && /^(Africa|Asia|Europe|North America|South America|Oceania)$/.test(c));
    if (r[1] && region) regionOf[r[1]] ??= region;
  }
}

const REGION_JA = {
  Africa: 'アフリカ', Asia: 'アジア', Europe: 'ヨーロッパ',
  'North America': '北アメリカ', 'South America': '南アメリカ', Oceania: 'オセアニア',
};

let list = Object.entries(byCode)
  .filter(([code, d]) => REQUIRED.every((k) => d[k] !== undefined) && regionOf[code] && d.pop >= 500_000)
  .map(([code, d]) => ({ code, region: regionOf[code], ...d }));

// 乳児死亡率が無ければ 5歳未満死亡率の 0.75 倍で推計
for (const c of list) if (c.imr === undefined) { c.imr = c.u5mr * 0.75; (c.est ??= []).push('imr'); }

for (const key of Object.keys(SPEC)) {
  for (const c of list) {
    if (c[key] !== undefined) continue;
    // 児童婚の調査は中低所得国にしか無い。高所得国の欠損は近傍で埋めると過大になるので 1% とする
    if (key === 'childMarriage' && c.gdp >= 20000) { c[key] = 0.01; (c.est ??= []).push(key); continue; }
    // 同じ地域で1人当たりGDPが近い5か国の平均
    const dist = (p) => Math.abs(Math.log(p.gdp / c.gdp)) + (p.region === c.region ? 0 : 1);
    const peers = list
      .filter((p) => p[key] !== undefined && !(p.est ?? []).includes(key))
      .sort((a, b) => dist(a) - dist(b))
      .slice(0, 5);
    c[key] = peers.reduce((s, p) => s + p[key], 0) / peers.length;
    (c.est ??= []).push(key);
  }
}

const SHORT_NAME_EN = {
  USA: 'United States', RUS: 'Russia', IRN: 'Iran', SYR: 'Syria', BOL: 'Bolivia', KOR: 'South Korea',
  LAO: 'Laos', MDA: 'Moldova', PSE: 'Palestine', TZA: 'Tanzania', VNM: 'Vietnam', COD: 'DR Congo', COG: 'Congo',
  GBR: 'United Kingdom', CZE: 'Czechia', NLD: 'Netherlands', ARE: 'United Arab Emirates',
};

const SHORT_NAME = {
  CHN: '中国', USA: 'アメリカ', RUS: 'ロシア', IRN: 'イラン', SYR: 'シリア', BOL: 'ボリビア',
  KOR: '韓国', LAO: 'ラオス', MDA: 'モルドバ', SWZ: 'エスワティニ', PSE: 'パレスチナ',
};

list = list.map((c) => {
  const name = SHORT_NAME[c.code] ?? countries.getName(c.code, 'ja') ?? c.code;
  const nameEn = SHORT_NAME_EN[c.code] ?? countries.getName(c.code, 'en', { select: 'alias' }) ?? c.code;
  const out = { code: c.code, name, nameEn, region: REGION_JA[c.region] };
  for (const k of Object.keys(SPEC)) out[k] = +(+c[k]).toPrecision(4);
  if (c.est) out.est = c.est;
  return out;
}).sort((a, b) => b.births - a.births);

writeFileSync(new URL('../src/data/countries.json', import.meta.url), JSON.stringify(list));
console.log(list.length, 'countries;', list.filter((c) => c.est).length, 'with estimates');
console.log(list.slice(0, 5).map((c) => `${c.name} ${c.births} le=${c.leF}/${c.leM} gdp=${c.gdp}`).join('\n'));
console.log('missing names:', list.filter((c) => c.name === c.code).map((c) => c.code).join(' '));
