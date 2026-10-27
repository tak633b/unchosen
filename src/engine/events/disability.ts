// 障害: 脳卒中のあとに残る障害と、診断 (認定) のあとに出る手当、仕事が長く見つからないときの「家で過ごす」時期。
import { L } from '../../i18n';
import { byCode, countryAt, type Country } from '../countries';
import { formatMoney } from '../economy';
import { bump, log, yearOf, type Person } from '../person';

// 障害の手当 (年額、購買力平価ドル。2024年の額を、その年のその国の1人当たりGDPで伸び縮みさせる)。
// work: 働いていても出るか。low: 暮らしの苦しい人だけ (資力調査)
//   日本: 障害基礎年金2級 年81万6,000円 (2024年度、日本年金機構)。1986年から。働いていても出る
//   米国: SSI 月943ドル (2024年、SSA)。1974年から。資産と収入の少ない人だけ
//   韓国: 障害者年金の基礎給付 月33万4,810ウォン (2024年、保健福祉部)。2010年から。所得の下位7割
//   英国: 個人自立手当 (PIP) の日常生活と移動の標準額 週101.35ポンド (2024/25年、DWP)。働いていても出る。2013年から、それまでは障害者生活手当 (DLA、1992年〜)
const BENEFIT: Record<string, { from: number; ppp: number; ja: string; en: string; work: boolean; low?: number }> = {
  JPN: { from: 1986, ppp: 816000 / 95, ja: '障害基礎年金', en: 'the disability basic pension', work: true },
  USA: { from: 1974, ppp: 943 * 12, ja: 'SSI (補足的保障所得)', en: 'SSI (Supplemental Security Income)', work: false, low: 0.3 },
  KOR: { from: 2010, ppp: 334810 * 12 / 820, ja: '障害者年金', en: 'the disability pension', work: false, low: 0.7 },
  GBR: { from: 1992, ppp: 101.35 * 52 / 0.67, ja: '個人自立手当 (PIP)', en: 'the Personal Independence Payment (PIP)', work: true },
};
const benefitName = (code: string, year: number) => (code === 'GBR' && year < 2013 ? L('障害者生活手当 (DLA)', 'Disability Living Allowance (DLA)') : L(BENEFIT[code].ja, BENEFIT[code].en));

// その年に受け取る障害の手当 (無ければ 0)。引退して年金を受け取る人には出さない (年金に切り替わる)
export function disabilityPay(p: Person, c: Country, working: boolean): number {
  const b = BENEFIT[c.code];
  if (p.disabled === undefined || !b || p.retired || yearOf(p) < b.from) return 0;
  if (working && !b.work) return 0;
  if (b.low !== undefined && (p.working ? p.incomeP : p.familyP) >= b.low) return 0;
  return b.ppp * c.gdp / byCode(c.code).gdp; // byCode は最新の年の値
}

// 脳卒中を乗り越えた人のおよそ半分に、長く続く障害が残る (WHO: 毎年1,500万人が脳卒中になり、500万人が亡くなり、500万人に障害が残る)
export function afterStroke(p: Person): void {
  if (p.disabled !== undefined || p.rng() >= 0.5) return;
  p.disabled = p.age;
  bump(p, { health: -8, happy: -5 });
  const c = countryAt(p.country, yearOf(p));
  const pay = disabilityPay(p, c, false);
  log(p, L('脳卒中のあと、手と足に麻痺が残った。障害の認定を受けた。', 'The stroke left a hand and a leg partly paralysed. Was certified as disabled.'), 'ill', true,
    L('毎年1,500万人が脳卒中になり、500万人に障害が残る (WHO)', 'Each year 15 million people have a stroke; 5 million are left permanently disabled (WHO)'));
  if (pay > 0) log(p, L(`${benefitName(c.code, yearOf(p))}を受け取り始めた (年${formatMoney(pay)})。`, `Began receiving ${benefitName(c.code, yearOf(p))} (${formatMoney(pay)} a year).`), 'ill');
  // 障害のある人の就業率は、ない人のおよそ半分 (OECD 2022)。働いていた人の4割ほどは、この年に仕事を離れる
  if (p.working && !p.retired && p.unemployed === 0 && p.rng() < 0.4) {
    p.unemployed = 1;
    log(p, L('体が元のようには動かず、仕事を離れることになった。', 'The body no longer worked as before, and the job had to go.'), 'hard');
  }
}

// 障害のある人が長く仕事を見つけられないと、しばらく仕事探しをやめて家で過ごす (「家で過ごす」)。
// 次の仕事探しの前に呼ぶ。家で過ごすことにしたら true
export function homeSpell(p: Person): boolean {
  if (p.disabled === undefined) return false;
  const since = p.recent.jobless ?? p.age;
  p.recent.jobless = since;
  // 障害のある人は、仕事の話が来る見込みが半分ほど (OECD 2022 の就業率の差)
  if (p.rng() < 0.5) return false;
  if (p.age - since >= 2 && p.age - (p.recent.homeSpell ?? -99) >= 8) {
    p.recent.homeSpell = p.age;
    p.unemployed = 2 + Math.floor(p.rng() * 2);
    log(p, L('仕事が長く見つからず、しばらく仕事探しをやめて家で過ごすことにした。', 'No work for a long time. Stopped looking for a while and stayed home.'), 'family');
    return true;
  }
  p.unemployed = 1;
  return true;
}
