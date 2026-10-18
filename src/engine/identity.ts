// 名前・都市・宗教。国ごとの命名文化から引く (src/data/identity.json)。
import data from '../data/identity.json';
import eraData from '../data/name-eras.json';
import type { Sex } from './lifetable';
import { isEn } from '../i18n';
import { pickWeighted, type Rng } from './rng';

interface Pool {
  male: string[];
  female: string[];
  family: string[];
  familyFemale?: string[];
  // 漢字・ハングルの名前の英語表記 (元の配列と同じ順)
  maleEn?: string[];
  femaleEn?: string[];
  familyEn?: string[];
  familyFemaleEn?: string[];
  order: 'family-first' | 'given-first';
  sep: string;
  faith?: string;   // この伝統の名を持つ人の宗教 (イスラム教の名など)。無ければどの宗教の人も持つ
}
interface CountryIdentity {
  pool?: string;
  pools?: [string, number][];
  cities: string[];
  citiesEn?: string[];
  religions: [string, number][];
}

// from のある伝統は、名をその伝統から借りて、姓だけを自分で持つ (scripts/build-roots-pools.mjs)
const RAW = data.pools as unknown as Record<string, Pool & { from?: string }>;
const POOLS: Record<string, Pool> = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, v.from
  ? { ...RAW[v.from], familyEn: undefined, familyFemale: undefined, familyFemaleEn: undefined, ...v }
  : v]));
// 姓の一覧 (元の文字)。家の姓を選び直すとき (roots.ts)
export const familyNames = (pool: string): string[] => POOLS[pool]?.family ?? [];
// 昔に生まれた人の名 (scripts/build-name-eras.mjs。出典はそこに書いた。明治安田生命の生まれ年別ランキング、米 SSA、英 ONS、INSEE、INE など)。
// [この年より前に生まれた人, 名]。どの帯にも入らない人は上の (いまの) 名
type Givens = Pick<Pool, 'male' | 'female' | 'maleEn' | 'femaleEn'>;
const ERAS = eraData as unknown as Record<string, [number, Givens][]>;
const givensAt = (poolId: string, pool: Pool, born?: number): Givens =>
  (born !== undefined && (ERAS[poolId] ?? ERAS[RAW[poolId]?.from ?? ''])?.find(([until]) => born < until)?.[1]) || pool;
const COUNTRIES = data.countries as unknown as Record<string, CountryIdentity>;
const FALLBACK: CountryIdentity = { pool: 'english', cities: [], religions: [['その他', 1]] };

const idOf = (code: string) => COUNTRIES[code] ?? FALLBACK;

export interface Name { given: string; full: string; pool: string; key: string } // key: 元の文字の名 (日英で同じ。家の中の重複を避けるのに使う)

// 宗教が分かっているときは、その宗教の人の伝統があればそれだけから、無ければ宗教を限らない伝統から名を引く
// year: 1960年より前の欧米 (MIGRANT_FAITH) では、移民の伝統の名を引かない (南アジア系・北アフリカ系の名の多くは1960年代からの移民とその子)
function poolsFor(ci: CountryIdentity, religion?: string, code?: string, year?: number): [string, number][] {
  if (ci.pools && year !== undefined && year < 1960 && code && MIGRANT_FAITH.has(code)) {
    const own = religion ? ci.pools.filter(([id]) => POOLS[id]?.faith === religion) : [];
    if (own.length) return own;
    return [ci.pools.reduce((a, b) => (b[1] > a[1] ? b : a))];
  }
  if (!ci.pools || !religion) return ci.pools ?? [];
  const own = ci.pools.filter(([id]) => POOLS[id]?.faith === religion);
  if (own.length) return own;
  const open = ci.pools.filter(([id]) => !POOLS[id]?.faith);
  return open.length ? open : ci.pools;
}

// year: 名を付けられる人が生まれた年 (名の流行と、移民の伝統を引くかに使う)
export function makeName(rng: Rng, code: string, sex: Sex, family?: { pool: string; index: number }, religion?: string, year?: number): Name & { familyIndex: number } {
  const ci = idOf(code);
  const poolId = family?.pool ?? (ci.pools ? pickWeighted(rng, poolsFor(ci, religion, code, year), ([, w]) => w)[0] : ci.pool!);
  const pool = POOLS[poolId] ?? Object.values(POOLS)[0];
  // 添字を先に引いてから言語で配列を選ぶ (同じ seed なら日英で同じ人生になる)
  const era = givensAt(poolId, pool, year);
  const givens = sex === 'F' ? era.female : era.male;
  const givenIndex = Math.floor(rng() * givens.length);
  const familyIndex = family?.index ?? Math.floor(rng() * pool.family.length);
  const female = sex === 'F' && pool.familyFemale;
  const en = isEn && pool.familyEn;
  const given = (en && (sex === 'F' ? era.femaleEn : era.maleEn)?.[givenIndex]) || givens[givenIndex];
  const fam = (en && (female ? pool.familyFemaleEn ?? pool.familyEn : pool.familyEn)?.[familyIndex])
    || (female ? pool.familyFemale![familyIndex] : pool.family[familyIndex]);
  // 英語の日本人名は名・姓の順。中国・韓国は姓・名のまま
  const order = en && poolId === 'japanese' ? 'given-first' : pool.order;
  const sep = en ? ' ' : pool.sep;
  const full = order === 'family-first' ? `${fam}${sep}${given}` : `${given}${sep}${fam}`;
  return { given, full, pool: poolId, familyIndex, key: givens[givenIndex] };
}

// 都市の人は上位の都市ほど生まれやすい
export function pickCity(rng: Rng, code: string): string | null {
  const ci = idOf(code);
  if (!ci.cities.length) return null;
  const i = pickWeighted(rng, ci.cities.map((_, i) => [i, 1 / (i + 1)] as const), ([, w]) => w)[0];
  return cityAt(ci, i);
}

const cityAt = (ci: CountryIdentity, i: number): string => (isEn && ci.citiesEn?.[i]) || ci.cities[i];

export const religionsOf = (code: string): [string, number][] => idOf(code).religions;
export const pickReligion = (rng: Rng, code: string, year?: number): string => pickWeighted(rng, year === undefined ? idOf(code).religions : religionsAt(code, year), ([, w]) => w)[0];

// ---- 1950年より前に生まれた人の宗教 -----------------------------------------------------------
// identity.json の割合はいまのもの。昔の生まれの人には、当時の割合を当てる (同じ乱数を1つ引くのは変わらない)
// ユダヤ教: 1930年前後の国勢調査 (いまの国境で読み替えた目安)。ポーランド1931年9.8%、リトアニア1923年7.6%、ハンガリー1930年5.1%、
//   ドイツ1933年0.8%、オーストリア1934年2.8%、オランダ1930年1.4〜1.6% など (USHMM; YIVO Encyclopedia; 各国の国勢調査)
// オスマン帝国のアナトリアには1914年まで、アルメニア人・ギリシャ人・アッシリア人のキリスト教徒が2割ほどいた (Karpat 1985)
// パキスタン (西パキスタン) の1941年の人口の2割ほど、東ベンガルの28%はヒンドゥー教徒とシク教徒だった (1941年インド国勢調査)
// ponytail: 国の中の地域差 (ユダヤ人は町に多い) は見ていない
const J = (share: number, until = 1946): [number, [string, number][]] => [until, [['ユダヤ教', share]]];
const PAST: Record<string, [number, [string, number][]][]> = {
  POL: [J(0.098)], LTU: [J(0.076)], LVA: [J(0.048)], EST: [J(0.004)], UKR: [J(0.06)], BLR: [J(0.08)], MDA: [J(0.07)], ROU: [J(0.042)],
  HUN: [J(0.051)], SVK: [J(0.04)], CZE: [J(0.012)], AUT: [J(0.028)], DEU: [J(0.008)], NLD: [J(0.016)], BEL: [J(0.008)], LUX: [J(0.012)],
  FRA: [J(0.008)], ITA: [J(0.001)], NOR: [J(0.001)], DNK: [J(0.002)], HRV: [J(0.006)], SRB: [J(0.004)], BIH: [J(0.006)], MKD: [J(0.008)],
  RUS: [J(0.008)], GBR: [J(0.007)], USA: [J(0.035)], CAN: [J(0.015)], ARG: [J(0.02)], MAR: [J(0.03)], TUN: [J(0.025)], DZA: [J(0.015)],
  LBY: [J(0.03)], IRQ: [J(0.026)], IRN: [J(0.006)], EGY: [J(0.005)], SYR: [J(0.01)],
  GRC: [[1923, [['イスラム教', 0.07], ['ユダヤ教', 0.011]]], J(0.011)],
  TUR: [[1915, [['キリスト教', 0.18], ['ユダヤ教', 0.005]]], [1924, [['キリスト教', 0.05], ['ユダヤ教', 0.005]]]],
  PAK: [[1947, [['ヒンドゥー教', 0.14], ['シク教', 0.05], ['キリスト教', 0.01]]]],
  BGD: [[1947, [['ヒンドゥー教', 0.28]]]],
  ISR: [[1920, [['ユダヤ教', 0.12], ['イスラム教', 0.75], ['キリスト教', 0.1]]], [1948, [['ユダヤ教', 0.35], ['イスラム教', 0.55], ['キリスト教', 0.08]]]],
};
// 西ヨーロッパ・北米・オセアニアのイスラム教徒とヒンドゥー教徒の多くは1960年代からの移民とその子
const MIGRANT_FAITH = new Set(['DEU', 'FRA', 'GBR', 'NLD', 'BEL', 'SWE', 'NOR', 'DNK', 'AUT', 'CHE', 'ITA', 'ESP', 'IRL', 'LUX', 'FIN', 'USA', 'CAN', 'AUS', 'NZL']);
// 「無宗教」が大きく増えたのは20世紀の後半から (1921年のチェコスロバキアの国勢調査で7.8%、1900年ごろの欧米ではほぼ1%未満)。
// 東アジアの「無宗教」は家の祭祀や仏教と重なる数え方なので、そのままにする
const EAST = new Set(['CHN', 'JPN', 'KOR', 'VNM', 'MNG']);
export function religionsAt(code: string, year: number): [string, number][] {
  let list = idOf(code).religions;
  if (year >= 1950) return list;
  const k = (r: string) => (r === '無宗教' && !EAST.has(code) ? (year < 1920 ? 0.1 : 0.25) : (r === 'イスラム教' || r === 'ヒンドゥー教') && MIGRANT_FAITH.has(code) ? 0.05 : 1);
  const lost = list.reduce((s, [r, w]) => s + w * (1 - k(r)), 0);
  const top = list.filter(([r]) => k(r) === 1).sort((a, b) => b[1] - a[1])[0]?.[0];
  list = list.map(([r, w]) => [r, w * k(r) + (r === top ? lost : 0)]);
  const fixed = PAST[code]?.find(([until]) => year < until)?.[1];
  if (!fixed) return list;
  const rest = 1 - fixed.reduce((s, [, w]) => s + w, 0);
  const others = list.filter(([r]) => !fixed.some(([f]) => f === r));
  const sum = others.reduce((s, [, w]) => s + w, 0) || 1;
  return [...others.map(([r, w]) => [r, (w / sum) * rest] as [string, number]), ...fixed];
}

export const firstCity = (code: string): string | null => (idOf(code).cities.length ? cityAt(idOf(code), 0) : null);
