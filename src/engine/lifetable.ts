// 国・性別ごとの生命表。
// 0歳は乳児死亡率、1–4歳は5歳未満死亡率から、5歳以上はゴンペルツ=メイカム型
// μ(x) = A + B·e^{cx} を置き、平均寿命が統計値に一致するよう B を二分法で決める。
// 63歳から先は傾きを上げ、その傾きは平均寿命が長い国・性別ほど急にする。
// 実際の生命表で 80→100歳 の死力の傾きを測ると、平均寿命と一緒に急になる:
//   米国男 0.104 (SSA 2023, e0 75.8) / 米国女 0.112 (81.1) / 韓国男 0.116 (KOSTAT 2024, 80.8)
//   日本男 0.117 (令和6年簡易生命表, 81.1) / 韓国女 0.137 (86.6) / 日本女 0.143 (87.1)
// 下の式はこれをほぼなぞる (日本女 0.144・日本男 0.120・米国女 0.121・米国男 0.101)。
// 一本の傾きのまま延ばすと、日本女性の 95歳到達が 36% (実際 25.6%)、100歳到達が 21% (実際 6.5%) になった
import type { Country } from './countries';

export type Sex = 'F' | 'M';
export const MAX_AGE = 110;
const GOMPERTZ_SLOPE = 0.095;
// 40→80歳の傾きは日本の実測 (0.091〜0.098) から。折れる年齢と傾きの式は、生命表の 90/95/100歳到達率が
// 日米韓の実際に合うよう探した値 (日本は男女とも ±1 ポイント以内)
const OLD_SLOPE_AT = 0.12;   // 平均寿命 OLD_REF_E0 年の国・性別での傾き
const OLD_REF_E0 = 81.7;
const OLD_SLOPE_PER_YEAR = 0.004;
const OLD_FROM = 63;

export interface LifeTable {
  q: number[];  // q[x] = x歳の人がx+1歳になる前に亡くなる確率
  l: number[];  // l[x] = 出生のうちx歳まで生きる割合
  e0: number;
}

const cache = new Map<string, LifeTable>();

export function lifeTable(c: Country, sex: Sex): LifeTable {
  const key = c.code + sex;
  const hit = cache.get(key);
  if (hit) return hit;
  const target = sex === 'F' ? c.leF : c.leM;
  // 男児は女児より乳幼児死亡がやや高い
  const sexK = sex === 'M' ? 1.1 : 0.9;
  const q0 = Math.min(0.3, c.imr * sexK);
  const u5 = Math.min(0.4, Math.max(c.u5mr * sexK, q0));
  const qChild = 1 - ((1 - u5) / (1 - q0)) ** 0.25;
  const makeham = Math.max(0.0002, 0.15 * qChild);
  const oldSlope = Math.max(GOMPERTZ_SLOPE, OLD_SLOPE_AT + OLD_SLOPE_PER_YEAR * (target - OLD_REF_E0));

  const build = (b: number): LifeTable => {
    const q = [q0, qChild, qChild, qChild, qChild];
    for (let x = 5; x < MAX_AGE; x++) {
      const a = x + 0.5;
      const mu = makeham + b * Math.exp(GOMPERTZ_SLOPE * a + (oldSlope - GOMPERTZ_SLOPE) * Math.max(0, a - OLD_FROM));
      q.push(Math.min(1, 1 - Math.exp(-mu)));
    }
    q.push(1);
    const l = [1];
    for (let x = 0; x < MAX_AGE; x++) l.push(l[x] * (1 - q[x]));
    let e0 = 0;
    for (let x = 0; x < MAX_AGE; x++) e0 += (l[x] + l[x + 1]) / 2;
    return { q, l, e0 };
  };

  // b が大きいほど e0 は小さい
  let lo = Math.log(1e-9), hi = Math.log(1);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (build(Math.exp(mid)).e0 > target) lo = mid; else hi = mid;
  }
  const t = build(Math.exp((lo + hi) / 2));
  cache.set(key, t);
  return t;
}

// 生存曲線: 同じ年に生まれた人のうち age 歳まで生きている割合
export const survival = (c: Country, sex: Sex, age: number): number =>
  lifeTable(c, sex).l[Math.min(MAX_AGE, Math.max(0, Math.floor(age)))];
