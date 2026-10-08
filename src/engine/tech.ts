// 暮らしの道具がどれだけ広まっているか (0–1)。出来事・仕事・場面の絵を、時代と国に合わせるのに使う。
// 広まり方は2つのかけ算: 世に出てからの年数 (豊かな国でも行き渡るまで何年もかかる) と、その国その年の所得 (1人当たりGDP)。
// 農村は都市より遅い。目安にした実際の値 (OWID / 世界銀行): 電気 1990年インド4割・2020年ナイジェリア6割、テレビ 1955年米国6割台・1960年日本4割台、
// 携帯 2000年日本5割・2010年インド6割、ネット 2000年米国4割台・2010年インド1割未満
import type { Country } from './countries';

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

export function techShare(c: Country, tech: Tech, rural = false, year = c.year ?? new Date().getFullYear()): number {
  // 電気は所得のわりに国ごとの差が大きい (1960年の日本はほぼ全戸、1990年のナイジェリアは3割弱) ので、実測があればそれを使う
  if (tech === 'electricity' && c.elec !== undefined) return Math.min(1, c.elec * (rural ? 0.8 : 1.05));
  if (year < FIRST[tech]) return 0;
  const [mid, speed, lag, gdp50] = SPEC[tech];
  const gdp = Math.max(c.gdp, 1);
  const start = mid + lag * Math.max(0, Math.log(40000 / gdp));
  const time = 1 / (1 + Math.exp(-(year - start) / speed));
  const cap = 1 / (1 + (gdp50 / gdp) ** 2);
  return time * cap * (rural ? 0.6 : 1);
}
