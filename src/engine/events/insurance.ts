// 保険: 毎年の保険料で、病院の自己負担を大きく減らし、70歳より前に亡くなれば家族にお金が残る。
import { L } from '../../i18n';
import type { Country } from '../countries';
import { earnings, yen } from '../economy';
import { decide, log, type Person } from '../person';

// 保険料は年収の4%ほど (日本の世帯の生命保険料は年37万円ほどで、世帯収入の5〜6%: 生命保険文化センター 2021)
const PREMIUM = 0.04;
// 自己負担のうち保険が払う割合
const COVER = 0.7;
// 70歳より前に亡くなったとき家族に出るお金 (年収の何年分か)
const PAYOUT_YEARS = 3;
export const COVER_UNTIL = 70;

// 収入の基準は、その人の所得の位置での年収 (引退後も同じ額を払い続ける)
const base = (p: Person, c: Country) => earnings(c, p.incomeP);
export const premium = (p: Person, c: Country): number => base(p, c) * PREMIUM;
// 病院で払う分 (保険に入っていれば3割)
export const outOfPocket = (p: Person, share: number): number => share * (p.insured ? 1 - COVER : 1);

// 保険に入っている世帯の割合 (自動で決めるときの目安)。日本は生命保険の世帯加入率89.8% (生命保険文化センター 2021)、
// 韓国も8割を超える。米国の生命保険の加入は52% (LIMRA 2023)。保険市場の浅い国ではずっと少ない
const UPTAKE: Record<string, number> = { JPN: 0.9, KOR: 0.85, TWN: 0.85, USA: 0.52 };
const uptake = (c: Country) => UPTAKE[c.code] ?? (c.gdp > 30000 ? 0.5 : c.gdp > 12000 ? 0.25 : 0.08);

export function insuranceOffer(p: Person, c: Country, income: number): void {
  if (p.insured !== undefined || !p.working || p.age < 25 || p.age > 50 || income <= 0 || c.gdp < 6000 || p.rng() > 0.08) return;
  const fee = premium(p, c);
  decide(p, {
    title: L('保険に入る？', 'Get insurance?'),
    text: L(`毎年${yen(fee)}の保険料で、入院や手術の自己負担が3割になり、${COVER_UNTIL}歳より前に亡くなれば家族に年収の${PAYOUT_YEARS}年分が出る。`,
      `For ${yen(fee)} a year, hospital bills drop to 30% out of pocket, and if death comes before ${COVER_UNTIL} the family receives ${PAYOUT_YEARS} years of income.`),
    stat: L(`保険に入っている世帯は、日本で約9割 (生命保険文化センター 2021)、米国で約半分 (LIMRA 2023)`, `About 9 in 10 households in Japan hold life insurance (Japan Institute of Life Insurance 2021); about half in the US (LIMRA 2023)`),
    options: [
      { label: L('入る', 'Sign up'), hint: L('毎年払い続ける', 'Pay every year'), apply: (q) => { q.insured = true; log(q, L('保険に入った。', 'Took out insurance.'), 'family'); } },
      { label: L('入らない', 'Skip it'), hint: L('その分を貯める', 'Save the money instead'), apply: (q) => { q.insured = false; } },
    ],
    auto: (q) => (q.rng() < uptake(c) ? 0 : 1),
  });
}

// 亡くなったとき、70歳より前で保険に入っていて、残された家族がいれば保険金が出る
export function lifePayout(p: Person, c: Country): number {
  if (!p.insured || p.age >= COVER_UNTIL) return 0;
  const family = p.spouse?.alive || p.children.some((k) => k.alive);
  if (!family) return 0;
  const sum = base(p, c) * PAYOUT_YEARS;
  p.wealth += sum;
  log(p, L(`保険から、残された家族に${yen(sum)}が支払われた。`, `The insurance paid ${yen(sum)} to the family left behind.`), 'family');
  return sum;
}
