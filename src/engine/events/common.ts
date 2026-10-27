import type { Country } from '../countries';
import { earnings } from '../economy';
import { lifeTable, type Sex } from '../lifetable';
import { countryOf, type Person } from '../person';
import { clamp } from '../rng';
import { PENSION_CAP, contribOf } from '../pension';
import { disabilityPay } from './disability';

export const qAt = (c: Country, sex: Sex, age: number) => lifeTable(c, sex).q[Math.min(110, Math.max(0, age))];
export const yearly = (total: number, years: number) => 1 - (1 - clamp(total, 0, 0.99)) ** (1 / years);

// 今の収入 (購買力平価ドル/年)。働いていなければ 0、年金があれば年金
export function currentIncome(p: Person): number {
  const c = countryOf(p);
  if (p.retired) return pension(p, c);
  if (!p.working || p.unemployed > 0) return disabilityPay(p, c, false);
  // 雇われて正規で働く人は、最低賃金より下には落ちない (自営と非正規には届かない)
  const floor = p.formal && !p.selfEmployed ? minimumWage(c) : 0;
  return Math.max(earnings(c, p.incomeP), floor) + disabilityPay(p, c, true);
}

// 最低賃金 ÷ フルタイムの賃金の中央値 (OECD 2022 の Kaitz 指数の目安)。0 は国の最低賃金が無い国
// (北欧・オーストリア・イタリア・スイスは労使の協約で決め、シンガポールは一部の職種だけ)。表に無い国は0.45とする
// (ILO: 世界の国のおよそ9割に何らかの最低賃金がある)
const KAITZ: Record<string, number> = {
  FRA: 0.61, KOR: 0.62, GBR: 0.58, JPN: 0.46, USA: 0.28, DEU: 0.52, AUS: 0.53, CAN: 0.5, ESP: 0.5, NLD: 0.47, NZL: 0.69,
  POL: 0.56, PRT: 0.67, TUR: 0.72, COL: 0.92, CHL: 0.68, MEX: 0.6, ISR: 0.55, GRC: 0.5, IRL: 0.5, BEL: 0.45, CZE: 0.44,
  SWE: 0, NOR: 0, DNK: 0, FIN: 0, ISL: 0, AUT: 0, ITA: 0, CHE: 0, SGP: 0,
};
export const minimumWage = (c: Country): number => (KAITZ[c.code] ?? 0.45) * earnings(c, 0.5);

export function pension(p: Person, c: Country): number {
  // 自分の会社を人に任せて退いた人は、年金の代わりに配当を受け取る (利益の分け前で、給料の4割ほど)
  if (p.business) return earnings(c, p.incomeP) * 0.4;
  // 早めに仕事を辞めた人は、年金の年齢までは受け取れない
  if (p.pensionAt !== undefined && p.age < p.pensionAt) return 0;
  const rate = p.formal ? (c.gdp > 15000 ? 0.55 : 0.3) : c.gdp > 30000 ? 0.3 : 0;
  // 上限のある国では、とても多く稼いだ人の年金は上限から先は増えない (pension.ts の PENSION_CAP)
  const cap = PENSION_CAP[c.code];
  const pay = cap ? Math.min(earnings(c, p.incomeP), earnings(c, 0.5) * cap) : earnings(c, p.incomeP);
  // 正規で働いた年数が30年に届かなければ、そのぶん少ない (家のことをするため早く仕事を離れた人も、働いた分は受け取る)
  const years = p.formal ? Math.min(1, contribOf(p) / 30) : 1;
  return pay * rate * years * (1 - (p.pensionCut ?? 0));
}

// 最低限の暮らしにかかる費用。収入がない年や、お金の目安に使う
export const subsistence = (c: Country) => earnings(c, 0.08) * 0.8;

// 金額の目安: 収入がない人でも暮らしの規模で測れるように
export const scaleOf = (p: Person) => Math.max(currentIncome(p), subsistence(countryOf(p)));

export const isPoor = (p: Person) => (p.working ? p.incomeP : p.familyP) < 0.4;
export const isRich = (p: Person) => (p.working ? p.incomeP : p.familyP) >= 0.8;
