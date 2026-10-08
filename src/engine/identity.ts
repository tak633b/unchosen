// 名前・都市・宗教。国ごとの命名文化から引く (src/data/identity.json)。
import data from '../data/identity.json';
import type { Sex } from './lifetable';
import { pick, pickWeighted, type Rng } from './rng';

interface Pool {
  male: string[];
  female: string[];
  family: string[];
  familyFemale?: string[];
  order: 'family-first' | 'given-first';
  sep: string;
}
interface CountryIdentity {
  pool?: string;
  pools?: [string, number][];
  cities: string[];
  religions: [string, number][];
}

const POOLS = data.pools as Record<string, Pool>;
const COUNTRIES = data.countries as Record<string, CountryIdentity>;
const FALLBACK: CountryIdentity = { pool: 'english', cities: [], religions: [['その他', 1]] };

const idOf = (code: string) => COUNTRIES[code] ?? FALLBACK;

export interface Name { given: string; full: string; pool: string }

export function makeName(rng: Rng, code: string, sex: Sex, family?: { pool: string; index: number }): Name & { familyIndex: number } {
  const ci = idOf(code);
  const poolId = family?.pool ?? (ci.pools ? pickWeighted(rng, ci.pools, ([, w]) => w)[0] : ci.pool!);
  const pool = POOLS[poolId] ?? Object.values(POOLS)[0];
  const given = pick(rng, sex === 'F' ? pool.female : pool.male);
  const familyIndex = family?.index ?? Math.floor(rng() * pool.family.length);
  const fam = sex === 'F' && pool.familyFemale ? pool.familyFemale[familyIndex] : pool.family[familyIndex];
  const full = pool.order === 'family-first' ? `${fam}${pool.sep}${given}` : `${given}${pool.sep}${fam}`;
  return { given, full, pool: poolId, familyIndex };
}

// 都市の人は上位の都市ほど生まれやすい
export function pickCity(rng: Rng, code: string): string | null {
  const cities = idOf(code).cities;
  if (!cities.length) return null;
  return pickWeighted(rng, cities.map((c, i) => [c, 1 / (i + 1)] as const), ([, w]) => w)[0];
}

export const pickReligion = (rng: Rng, code: string): string => pickWeighted(rng, idOf(code).religions, ([, w]) => w)[0];

export const firstCity = (code: string): string | null => idOf(code).cities[0] ?? null;
