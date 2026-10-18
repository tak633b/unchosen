// 名前・都市・宗教。国ごとの命名文化から引く (src/data/identity.json)。
import data from '../data/identity.json';
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
const COUNTRIES = data.countries as unknown as Record<string, CountryIdentity>;
const FALLBACK: CountryIdentity = { pool: 'english', cities: [], religions: [['その他', 1]] };

const idOf = (code: string) => COUNTRIES[code] ?? FALLBACK;

export interface Name { given: string; full: string; pool: string; key: string } // key: 元の文字の名 (日英で同じ。家の中の重複を避けるのに使う)

// 宗教が分かっているときは、その宗教の人の伝統があればそれだけから、無ければ宗教を限らない伝統から名を引く
function poolsFor(ci: CountryIdentity, religion?: string): [string, number][] {
  if (!ci.pools || !religion) return ci.pools ?? [];
  const own = ci.pools.filter(([id]) => POOLS[id]?.faith === religion);
  if (own.length) return own;
  const open = ci.pools.filter(([id]) => !POOLS[id]?.faith);
  return open.length ? open : ci.pools;
}

export function makeName(rng: Rng, code: string, sex: Sex, family?: { pool: string; index: number }, religion?: string): Name & { familyIndex: number } {
  const ci = idOf(code);
  const poolId = family?.pool ?? (ci.pools ? pickWeighted(rng, poolsFor(ci, religion), ([, w]) => w)[0] : ci.pool!);
  const pool = POOLS[poolId] ?? Object.values(POOLS)[0];
  // 添字を先に引いてから言語で配列を選ぶ (同じ seed なら日英で同じ人生になる)
  const givens = sex === 'F' ? pool.female : pool.male;
  const givenIndex = Math.floor(rng() * givens.length);
  const familyIndex = family?.index ?? Math.floor(rng() * pool.family.length);
  const female = sex === 'F' && pool.familyFemale;
  const en = isEn && pool.familyEn;
  const given = (en && (sex === 'F' ? pool.femaleEn : pool.maleEn)?.[givenIndex]) || givens[givenIndex];
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
export const pickReligion = (rng: Rng, code: string): string => pickWeighted(rng, idOf(code).religions, ([, w]) => w)[0];

export const firstCity = (code: string): string | null => (idOf(code).cities.length ? cityAt(idOf(code), 0) : null);
