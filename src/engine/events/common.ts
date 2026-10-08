import type { Country } from '../countries';
import { earnings } from '../economy';
import { lifeTable, type Sex } from '../lifetable';
import { countryOf, type Person } from '../person';
import { clamp } from '../rng';

export const qAt = (c: Country, sex: Sex, age: number) => lifeTable(c, sex).q[Math.min(110, Math.max(0, age))];
export const yearly = (total: number, years: number) => 1 - (1 - clamp(total, 0, 0.99)) ** (1 / years);

// 今の収入 (購買力平価ドル/年)。働いていなければ 0、年金があれば年金
export function currentIncome(p: Person): number {
  const c = countryOf(p);
  if (p.retired) return pension(p, c);
  if (!p.working || p.unemployed > 0) return 0;
  return earnings(c, p.incomeP);
}

export function pension(p: Person, c: Country): number {
  const rate = p.formal ? (c.gdp > 15000 ? 0.55 : 0.3) : c.gdp > 30000 ? 0.3 : 0;
  return earnings(c, p.incomeP) * rate;
}

// 最低限の暮らしにかかる費用。収入がない年や、お金の目安に使う
export const subsistence = (c: Country) => earnings(c, 0.08) * 0.8;

// 金額の目安: 収入がない人でも暮らしの規模で測れるように
export const scaleOf = (p: Person) => Math.max(currentIncome(p), subsistence(countryOf(p)));

export const isPoor = (p: Person) => (p.working ? p.incomeP : p.familyP) < 0.4;
export const isRich = (p: Person) => (p.working ? p.incomeP : p.familyP) >= 0.8;
