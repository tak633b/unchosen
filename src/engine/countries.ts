import data from '../data/countries.json';
import { isEn } from '../i18n';
import { pickWeighted, type Rng } from './rng';
import { lifeTable, mortalityReady, whenMortality } from './lifetable';

export interface Country {
  code: string;
  name: string; // 表示の言語での国名
  nameEn?: string;
  region: string;
  births: number;
  pop: number;
  leF: number;
  leM: number;
  imr: number;
  u5mr: number;
  gdp: number;
  gini: number;
  school: number;
  tertiary: number;
  agri: number;
  tfr: number;
  mmr: number;
  hiv: number;
  homicide: number;
  smoke: number;
  oop: number;
  childMarriage: number;
  happiness: number;
  flfp: number; // 女性の労働参加率
  est?: string[];
  year?: number; // 暦年の値なら、その年 (countryAt)。無ければ最新の1年 (countries.json)
}

export const COUNTRIES: Country[] = (data as Country[]).map((c) => (isEn && c.nameEn ? { ...c, name: c.nameEn } : c));
export const byCode = (code: string) => COUNTRIES.find((c) => c.code === code)!;

// ---- 暦年の国 (1950〜2100年) ----
// era.json は5年ごとの値。間の年は直線で埋める。読み込む前 (setEra の前) は最新の1年の値を返す
export interface Era { years: number[]; now: number; countries: Record<string, Record<string, number[]> & { obs: Record<string, [number, number]> }> }
export const ERA_FROM = 1950, ERA_TO = 2100;
export const ERA_NOW = 2023; // 実測の最後の年。これより先は予測
let era: Era | null = null;
const memo = new Map<string, Country>();
export function setEra(e: Era): void { era = e; memo.clear(); }
whenMortality(() => memo.clear());
export const eraReady = () => era !== null;

export function countryAt(code: string, year: number): Country {
  const base = byCode(code);
  if (!era || !era.countries[code]) return base;
  const y = Math.min(ERA_TO, Math.max(ERA_FROM, Math.round(year)));
  const key = code + y;
  const hit = memo.get(key);
  if (hit) return hit;
  const d = era.countries[code];
  const step = era.years[1] - era.years[0];
  const i = Math.min(era.years.length - 2, Math.floor((y - era.years[0]) / step));
  const t = (y - era.years[i]) / step;
  const c: Country = { ...base, year: y };
  for (const [k, v] of Object.entries(d)) if (Array.isArray(v)) (c as unknown as Record<string, number>)[k] = v[i] + (v[i + 1] - v[i]) * t;
  // 寿命と子どもの死亡は、毎年の生命表から出す (5年ごとの表を直線で埋めると、1994年のルワンダのような年が消える)
  if (mortalityReady()) {
    const f = lifeTable(c, 'F'), m = lifeTable(c, 'M');
    c.leF = f.e0; c.leM = m.e0;
    c.imr = (f.q[0] + m.q[0]) / 2;
    c.u5mr = 1 - (f.l[5] + m.l[5]) / 2;
  }
  memo.set(key, c);
  return c;
}
export const countriesAt = (year?: number): Country[] => (year === undefined || !era ? COUNTRIES : COUNTRIES.map((c) => countryAt(c.code, year)));

// その年の値が、実測 (補間を含む)・推定・予測のどれか。WPP の人口統計は2024年から予測
export type Basis = 'obs' | 'est' | 'proj';
const WPP_KEYS = ['births', 'pop', 'leF', 'leM', 'imr', 'u5mr', 'tfr'];
export function basisOf(code: string, key: string, year: number): Basis {
  if (!era) return 'obs';
  if (WPP_KEYS.includes(key) || key === 'gdp') return year > ERA_NOW ? 'proj' : 'obs';
  const r = era.countries[code]?.obs[key];
  if (!r || year < r[0] || year > r[1]) return year > ERA_NOW ? 'proj' : 'est';
  return 'obs';
}

export type BirthBasis = 'births' | 'pop';
export const totalOf = (basis: BirthBasis, year?: number) => countriesAt(year).reduce((s, c) => s + c[basis], 0);
export const pickBirthCountry = (rng: Rng, basis: BirthBasis, year?: number) => pickWeighted(rng, countriesAt(year), (c) => c[basis]);
