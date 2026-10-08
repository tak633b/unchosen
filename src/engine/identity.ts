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
}
interface CountryIdentity {
  pool?: string;
  pools?: [string, number][];
  cities: string[];
  citiesEn?: string[];
  religions: [string, number][];
}

const POOLS = data.pools as Record<string, Pool>;
const COUNTRIES = data.countries as unknown as Record<string, CountryIdentity>;
const FALLBACK: CountryIdentity = { pool: 'english', cities: [], religions: [['その他', 1]] };

const idOf = (code: string) => COUNTRIES[code] ?? FALLBACK;

export interface Name { given: string; full: string; pool: string; key: string } // key: 元の文字の名 (日英で同じ。家の中の重複を避けるのに使う)

export function makeName(rng: Rng, code: string, sex: Sex, family?: { pool: string; index: number }): Name & { familyIndex: number } {
  const ci = idOf(code);
  const poolId = family?.pool ?? (ci.pools ? pickWeighted(rng, ci.pools, ([, w]) => w)[0] : ci.pool!);
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

export const pickReligion = (rng: Rng, code: string): string => pickWeighted(rng, idOf(code).religions, ([, w]) => w)[0];

export const firstCity = (code: string): string | null => (idOf(code).cities.length ? cityAt(idOf(code), 0) : null);
