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

// ---- 国連 WPP 2024 の単歳生命表 (暦年ごと) ----
// mortality.json: 年の行 (1950〜2023は毎年、それ以降は5年ごと) × 0〜100歳の qx を、-ln(qx)×K の整数で持ち、行どうしの差分で詰めたもの。
// 読み込む前 (setMortality の前) と、暦年を持たない国 (countries.json の最新の1年) は、下のモデルで作る
export interface Mortality { K: number; years: number[]; ages: number; countries: Record<string, Record<Sex, number[]>> }
let mort: Mortality | null = null;
const decoded = new Map<string, Float64Array[]>();
export function setMortality(m: Mortality): void { mort = m; decoded.clear(); cache.clear(); onMortality?.(); }
let onMortality: (() => void) | undefined;
// countries.ts が、生命表から出した寿命の作り直しのために使う
export const whenMortality = (fn: () => void) => { onMortality = fn; };
export const mortalityReady = () => mort !== null;

function rows(code: string, sex: Sex): Float64Array[] | null {
  const raw = mort?.countries[code]?.[sex];
  if (!mort || !raw) return null;
  const key = code + sex;
  const hit = decoded.get(key);
  if (hit) return hit;
  const out: Float64Array[] = [];
  const cur = new Array<number>(mort.ages).fill(0);
  for (let r = 0; r < mort.years.length; r++) {
    for (let a = 0; a < mort.ages; a++) cur[a] += raw[r * mort.ages + a];
    out.push(Float64Array.from(cur, (v) => Math.exp(-v / mort!.K)));
  }
  decoded.set(key, out);
  return out;
}

// その暦年の年齢別死亡確率 (0〜MAX_AGE)。行の間の年は対数の上で直線に埋める。100歳以上は95→99歳の傾きで延ばす
function periodQ(code: string, sex: Sex, year: number): number[] | null {
  const rs = rows(code, sex);
  if (!rs || !mort) return null;
  const ys = mort.years;
  const y = Math.min(ys[ys.length - 1], Math.max(ys[0], year));
  let i = ys.findIndex((v) => v >= y);
  const t = ys[i] === y ? 0 : (y - ys[i - 1]) / (ys[i] - ys[i - 1]);
  if (t) i--;
  const q: number[] = [];
  for (let a = 0; a < 100; a++) q.push(Math.exp(Math.log(rs[i][a]) * (1 - t) + Math.log(rs[Math.min(i + 1, rs.length - 1)][a]) * t));
  const h = (x: number) => -Math.log(1 - Math.min(q[x], 0.999));
  const slope = Math.log(h(99) / h(95)) / 4;
  for (let a = 100; a < MAX_AGE; a++) q.push(Math.min(1, 1 - Math.exp(-h(99) * Math.exp(slope * (a - 99)))));
  q.push(1);
  return q;
}

function fromQ(q: number[]): LifeTable {
  const l = [1];
  for (let x = 0; x < MAX_AGE; x++) l.push(l[x] * (1 - q[x]));
  let e0 = 0;
  for (let x = 0; x < MAX_AGE; x++) e0 += (l[x] + l[x + 1]) / 2;
  return { q, l, e0 };
}

// 主人公と同じ年・同じ国に生まれた人たち
export const bornTable = (c: Country, sex: Sex, birthYear: number) => cohortTable(c, sex, birthYear);

// 生まれた年の人たちが、その後の各暦年の死亡率で生きた場合 (コホート)。「同じ年に生まれた人のうち何%が」はこちら
export function cohortTable(c: Country, sex: Sex, birthYear: number): LifeTable {
  if (!mort?.countries[c.code]) return lifeTable(c, sex);
  const key = `c${c.code}${sex}${birthYear}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const q: number[] = [];
  for (let x = 0; x <= MAX_AGE; x++) q.push(x === MAX_AGE ? 1 : periodQ(c.code, sex, birthYear + x)![x]);
  const t = fromQ(q);
  cache.set(key, t);
  return t;
}

export function lifeTable(c: Country, sex: Sex): LifeTable {
  const key = c.code + sex + (c.year ?? '');
  const hit = cache.get(key);
  if (hit) return hit;
  const wq = c.year !== undefined ? periodQ(c.code, sex, c.year) : null;
  if (wq) {
    const t = fromQ(wq);
    cache.set(key, t);
    return t;
  }
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
