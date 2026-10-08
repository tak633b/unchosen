import data from '../data/countries.json';
import { pickWeighted, type Rng } from './rng';

export interface Country {
  code: string;
  name: string;
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
  est?: string[];
}

export const COUNTRIES: Country[] = data as Country[];
export const byCode = (code: string) => COUNTRIES.find((c) => c.code === code)!;

export type BirthBasis = 'births' | 'pop';
export const totalOf = (basis: BirthBasis) => COUNTRIES.reduce((s, c) => s + c[basis], 0);
export const pickBirthCountry = (rng: Rng, basis: BirthBasis) => pickWeighted(rng, COUNTRIES, (c) => c[basis]);
