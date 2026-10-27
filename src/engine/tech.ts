// 暮らしの道具がどれだけ広まっているか (0–1)。出来事・仕事・場面の絵を、時代と国に合わせるのに使う。
// 広まり方は2つのかけ算: 世に出てからの年数 (豊かな国でも行き渡るまで何年もかかる) と、その国その年の所得 (1人当たりGDP)。
// 農村は都市より遅い。目安にした実際の値 (OWID / 世界銀行): 電気 1990年インド4割・2020年ナイジェリア6割、テレビ 1955年米国6割台・1960年日本4割台、
// 携帯 2000年日本5割・2010年インド6割、ネット 2000年米国4割台・2010年インド1割未満
import type { Country } from './countries';
import { L } from '../i18n';
import { bump, countryOf, log, yearOf, type Person } from './person';
import { homeRank } from './air';

// ---- 家に初めてテレビが来た年 ------------------------------------------------------------------------
// 家ごとに一つの順位 (air.ts の homeRank。生まれた家の所得分位と相関) を持ち、その国・その年のテレビのある家の割合が
// 豊かな側から数えてその家に届いた年に、テレビが来る。生まれたときにすでにある家では何も書かない。人生の乱数の並びは変えない
export function tvArrives(p: Person): void {
  const y = yearOf(p);
  if (y < 1950 || p.recent['tech:tv'] !== undefined) return;
  const share = techShare(countryOf(p), 'tv', p.city === null, y);
  if (homeRank(p, 9201) <= 1 - share) return;
  p.recent['tech:tv'] = p.age;
  if (p.age < 3) return;
  const pct = Math.round(share * 100);
  log(p, pct < 30
    ? L('家に初めてテレビが来た。近所でもまだ珍しく、夜になると子どもたちが見に集まった。', 'The first television came into the house. It was still a rarity in the neighbourhood, and in the evenings the children gathered to watch.')
    : L('家に初めてテレビが来た。家族みんなで、四角い画面の前に座った。', 'The first television came into the house. The whole family sat down in front of the little screen.'), 'family', false,
  L(`${y}年、${countryOf(p).name}の${p.city === null ? '農村' : '町'}でテレビのある家は約${pct}%だった`, `In ${y}, about ${pct}% of ${p.city === null ? 'rural' : 'town'} homes in ${countryOf(p).name} had a television`));
  bump(p, { happy: 3 });
}

export type Tech = 'electricity' | 'appliance' | 'tv' | 'car' | 'mobile' | 'smartphone' | 'internet' | 'computer';

// [豊かな国で半分に届いた年, 広がる速さ (年), 所得が低いほど遅れる年数 (log(4万ドル/GDP) あたり), 上限が半分になる1人当たりGDP]
// ponytail: 国ごとの事情 (日本のテレビは所得のわりに早かった、など) は入らない。目安の確かめは tech.test.ts
const SPEC: Record<Tech, [number, number, number, number]> = {
  electricity: [1925, 10, 18, 2500],
  appliance: [1960, 5, 6, 6000], // 冷蔵庫・洗濯機 (日本は1965年ごろに半分、インドの冷蔵庫は2010年代に3割台)
  tv: [1950, 4, 8, 5000],
  car: [1935, 8, 5, 15000],
  mobile: [1999, 2.5, 3, 2500],
  smartphone: [2013, 2.5, 2, 4000],
  internet: [2001, 3.5, 7, 5000],
  computer: [1998, 4, 8, 12000],
};

// 世に出た年。S字の曲線は裾が0にならないので、これより前は0にする (2005年のスマートフォンを出さない)
const FIRST: Record<Tech, number> = { electricity: 1880, appliance: 1930, tv: 1936, car: 1900, mobile: 1983, smartphone: 2007, internet: 1991, computer: 1975 };

// テレビのある家の割合の実測 (%)。[年, 全国] か [年, 都市, 農村]。所得だけの曲線は国ごとのずれが大きい
// (1960年のフランスは13%、日本は45%) ので、実測のある国はそれを直線でつなぐ。最初の点の6年前を0、最後の点からあとは曲線と大きいほう
// 米国: 国勢調査・Nielsen / 英国・西ドイツ・イタリア: 受信契約数 ÷ 世帯数 / フランス: INSEE / 日本: 内閣府 消費動向調査 (白黒を含む) /
// 韓国: 経済企画院 / ブラジル: IBGE 国勢調査 / ソ連: 国民経済統計 (100家族あたり) / 中国: 国家統計局 城鎮・農村住戸調査 (100戸あたり、白黒を含む) /
// インド: NFHS-1 (1992-93)・国勢調査 2001・2011・NFHS-5 (2019-21) / ナイジェリア: DHS 2008・2013・2018
type TvPoint = [number, number] | [number, number, number];
const TV: Record<string, TvPoint[]> = {
  USA: [[1950, 9], [1955, 65], [1960, 87], [1970, 95]],
  GBR: [[1950, 2], [1955, 30], [1960, 65], [1965, 80], [1970, 91]],
  FRA: [[1955, 1], [1960, 13], [1965, 42], [1970, 70], [1975, 86]],
  DEU: [[1955, 2], [1960, 24], [1965, 50], [1970, 75], [1975, 90]],
  ITA: [[1955, 1], [1960, 15], [1965, 40], [1970, 63], [1975, 75]],
  JPN: [[1955, 1], [1958, 16], [1960, 45], [1965, 90]],
  KOR: [[1965, 1], [1970, 6], [1975, 30], [1980, 87]],
  BRA: [[1960, 5], [1970, 24], [1980, 56], [1991, 71], [2000, 87], [2010, 95]],
  RUS: [[1960, 8], [1965, 24], [1970, 51], [1975, 74], [1980, 85], [1985, 97]],
  CHN: [[1980, 32, 1], [1985, 84, 12], [1990, 97, 44], [1995, 97, 81], [2000, 97, 95]],
  IND: [[1982, 5, 0.5], [1993, 51, 9], [2001, 64, 19], [2011, 77, 33], [2020, 88, 61]],
  NGA: [[2008, 40], [2013, 44], [2018, 40]],
};
function tvData(code: string, rural: boolean, year: number): number | undefined {
  const pts = TV[code];
  if (!pts) return undefined;
  // 全国の値しかない国は、都市を2割高く、農村を4分の3にする (ponytail: 都市と農村の割合は国と年で違う)
  const v = (q: TvPoint) => (q.length === 3 ? (rural ? q[2] : q[1]) : Math.min(98, q[1] * (rural ? 0.75 : 1.2))) / 100;
  if (year >= pts[pts.length - 1][0]) return undefined;
  const line: [number, number][] = [[pts[0][0] - 6, 0], ...pts.map((q) => [q[0], v(q)] as [number, number])];
  if (year <= line[0][0]) return 0;
  for (let i = 1; i < line.length; i++) if (year <= line[i][0]) { const [y0, a] = line[i - 1], [y1, b] = line[i]; return a + ((b - a) * (year - y0)) / (y1 - y0); }
  return undefined;
}
const tvLast = (code: string, rural: boolean) => { const q = TV[code]?.at(-1); return q ? (q.length === 3 ? (rural ? q[2] : q[1]) : Math.min(98, q[1] * (rural ? 0.75 : 1.2))) / 100 : 0; };

export function techShare(c: Country, tech: Tech, rural = false, year = c.year ?? new Date().getFullYear()): number {
  // 電気は所得のわりに国ごとの差が大きい (1960年の日本はほぼ全戸、1990年のナイジェリアは3割弱) ので、実測があればそれを使う
  if (tech === 'electricity' && c.elec !== undefined) return Math.min(1, c.elec * (rural ? 0.8 : 1.05));
  if (tech === 'tv') {
    const d = tvData(c.code, rural, year);
    if (d !== undefined) return d;
    if (TV[c.code]) return Math.max(tvLast(c.code, rural), curve(c, tech, rural, year));
  }
  return curve(c, tech, rural, year);
}

function curve(c: Country, tech: Tech, rural: boolean, year: number): number {
  if (year < FIRST[tech]) return 0;
  const [mid, speed, lag, gdp50] = SPEC[tech];
  const gdp = Math.max(c.gdp, 1);
  const start = mid + lag * Math.max(0, Math.log(40000 / gdp));
  const time = 1 / (1 + Math.exp(-(year - start) / speed));
  const cap = 1 / (1 + (gdp50 / gdp) ** 2);
  return time * cap * (rural ? 0.6 : 1);
}
