// 仕事: 職を選ぶ・失う・昇進する・辞める。
import type { Country } from '../countries';
import { earnings, formatMoney, monthlyYen } from '../economy';
import { L, isEn } from '../../i18n';
import { offerFor, pickOffers, jobName, JOBS, type Offer } from '../jobs';
import { bump, countryOf, decide, eduLevel, log, type Person } from '../person';
import { clamp, normal } from '../rng';
import { shared } from '../bonds';
import { layoffK } from '../market';
import { businessRetire, career, leaveReason } from './career';
import { contribOf, pensionRule, type Early, type Rule } from '../pension';
import { currentIncome } from './common';
import { homeSpell } from './disability';
import { isSocialist } from '../era';

function takeJob(p: Person, o: Offer, first: boolean): void {
  p.working = true;
  p.unemployed = 0;
  delete p.recent.jobless;
  p.job = o.job.name;
  p.jobKind = o.job.kind;
  p.selfEmployed = /自分の畑|露天商|日雇い|市場の店主|漁師|家畜/.test(o.job.name);
  p.jobYears = 0;
  p.incomeP = o.p;
  p.formal = o.formal;
  log(p, L(`${o.job.name}として働き始めた。年収 ${formatMoney(o.pay)}${o.formal ? '' : '(非正規)'}。`, `Started work as: ${jobName(o.job.name)}. ${formatMoney(o.pay)} a year${o.formal ? '' : ' (informal)'}.`), 'work', first);
}

const offerLabel = (o: Offer) => ({
  label: jobName(o.job.name),
  hint: isEn
    ? `$${Math.round(o.pay).toLocaleString()}/yr · ${o.formal ? 'formal (pension, insurance)' : 'informal'}`
    : `年収 $${Math.round(o.pay).toLocaleString()}・日本の感覚で月${monthlyYen(o.pay)}・${o.formal ? '正規(年金・保険あり)' : '非正規'}`,
});

export function jobSearch(p: Person, first = true): void {
  const c = countryOf(p);
  const edu = eduLevel(p);
  const offers = pickOffers(p, c, edu, p.rng);
  if (!offers.length) { p.working = true; p.job = '日雇いの仕事'; p.jobKind = 'manual'; p.incomeP = 0.15; return; }
  const informal = c.gdp < 5000 ? 85 : c.gdp < 15000 ? 60 : c.gdp < 30000 ? 30 : 12;
  decide(p, {
    title: first ? L('最初の仕事を選ぶ', 'First job') : L('新しい仕事を選ぶ', 'New job'),
    text: isEn
      ? `Schooling: ${['none', 'primary', 'middle school', 'high school', 'university', 'graduate school'][edu]}. Work found in a ${p.rural ? 'village' : 'town'} in ${c.name}.`
      : `学歴: ${['なし', '小学校', '中学校', '高校', '大学', '大学院'][edu]}。${c.name}の${p.rural ? '村' : '町'}で見つかった仕事。`,
    stat: L(`${c.name}では働く人のおよそ${informal}%が非正規の仕事に就いている (ILO の推計にもとづく目安)`, `About ${informal}% of workers in ${c.name} are in informal jobs (rough figure based on ILO estimates)`),
    options: [
      ...offers.map((o) => ({ ...offerLabel(o), apply: (q: Person) => takeJob(q, o, first) })),
      // 社会主義の国では仕事は割り当てられ、待つという選択がない (era.ts)
      ...(p.age >= 16 && !isSocialist(p) ? [{
        label: L('もっといい仕事を待つ', 'Wait for better'), hint: L('もう1年探す', 'Search one more year'),
        apply: (q: Person) => { q.unemployed = 1; q.working = true; log(q, L('仕事を探し続けた。', 'Kept looking for work.'), 'work'); },
      }] : []),
    ],
    auto: () => 0,
  });
}

// 女性が外で働くことを家族が望まない国がある。女性の労働参加率から確率を決める
// 家に留まる確率。労働参加率は高齢者も含むので、働き盛りに合うよう 1.4 倍して引く (実測で調整)。
// 大学を出た女性ほど外で働く
export const homeShare = (p: Person) => {
  if (p.sex !== 'F') return 0;
  const edu = eduLevel(p);
  const k = edu >= 4 ? 0.55 : edu === 3 ? 1 : 1.1;
  return Math.max(0, Math.min(0.9, (1 - countryOf(p).flfp * 1.4) * k));
};

function staysHome(p: Person): boolean {
  const c = countryOf(p);
  const pHome = homeShare(p);
  if (pHome < 0.1) return false;
  // 幼い娘には選ぶ余地がない
  if (p.age < 15) {
    if (p.rng() >= pHome) return false;
    shared(p, p.mother.alive ? [p.mother] : [], L('学校をやめ、家で母親を手伝って家事と弟や妹の世話をするようになった。', 'Left school to help her mother at home with housework and the younger children.'), 'family', 3, false, undefined, 'home_help');
    p.homemaker = true;
    return true;
  }
  decide(p, {
    title: L('外で働く？', 'Work outside?'),
    text: L('家族は、あなたが外で働くより家のことをするよう望んでいる。', 'Your family would rather you stayed home than worked outside.'),
    stat: L(`${c.name}では、15歳以上の女性のうち働いている(仕事を探している)のはおよそ${Math.round(c.flfp * 100)}% (ILO)`, `In ${c.name}, about ${Math.round(c.flfp * 100)}% of women 15 and older are working or looking for work (ILO)`),
    options: [
      { label: L('外で働く', 'Work outside'), hint: L('家族とぶつかるかもしれない', 'May cause friction at home'), apply: (q) => { bump(q, { bond: -4 }); jobSearch(q); } },
      { label: L('家のことをする', 'Stay home'), hint: L('収入は家族に頼る', 'Rely on family income'), apply: (q) => { q.working = false; q.job = undefined; q.homemaker = true; log(q, L('家で家族の世話と家事をして暮らすことになった。', 'Stayed home, caring for the family and running the house.'), 'family'); } },
    ],
    auto: (q) => (q.rng() < pHome ? 1 : 0),
  });
  return true;
}

// 学校を出て働き始める。幼くして働く子は選ぶ余地がない
export function startWork(p: Person): void {
  if (p.age < 15) {
    if (staysHome(p)) return;
    const c = countryOf(p);
    const kid = JOBS.filter((j) => j.edu === 0 && (!j.where || (j.where === 'rural') === p.rural));
    takeJob(p, offerFor(p, c, kid[Math.floor(p.rng() * kid.length)], p.rng), true);
    return;
  }
  if (p.age >= 15 && staysHome(p)) return;
  jobSearch(p);
}

export function work(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  // 家のことをするため仕事を離れた人も、働いていた間の年金は年金の年齢から受け取る
  if (p.homemaker && !p.working && !p.retired && p.formal && (p.contrib ?? 0) > 0 && c.gdp > 15000) {
    const rule = pensionRule(p, c);
    if (p.age >= rule.age && p.contrib! >= rule.minYears) {
      p.retired = true;
      p.pensionAt = p.age;
      log(p, L(`若いころに${p.contrib}年働いた分の年金を受け取り始めた。`, `Began drawing the pension earned in ${p.contrib} years of work when younger.`), 'old');
    }
    return;
  }
  // 学校を出たのに仕事のない大人は、毎年もう一度仕事を探す
  if (!p.working && !p.homemaker && !p.retired && p.age >= 16 && p.age < 60 && !p.school.enrolled
    && p.school.uni !== 'studying' && p.school.grad !== 'studying' && p.military !== 'serving' && p.pending.length === 0) {
    startWork(p);
    return;
  }
  if (!p.working || p.retired || p.school.uni === 'studying' || p.school.grad === 'studying' || p.military === 'serving') return;
  if (p.unemployed > 0) {
    p.unemployed--;
    if (p.unemployed === 0 && !homeSpell(p)) jobSearch(p, false);
    return;
  }
  p.jobYears++;
  if (p.formal) p.contrib = (p.contrib ?? 0) + 1;
  p.incomeP = clamp(p.incomeP + normal(r, p.focus === 'work' ? 0.012 : 0.002, 0.025), 0.01, 0.99);
  // 不況・危機の年は職を失いやすい (market.ts。長い目で見た平均は1倍)
  // 失業率の高い国ほど、仕事を失いやすく、次が見つかるまで長い (unempK)
  const k = unempK(c);
  // 社会主義の国では失業はまれで、職場が人を減らしても別の職場に割り当てられる (ソ連憲法は労働を権利と義務とし、公式には失業が無かった。era.ts)
  const soc = isSocialist(p);
  if (p.age < 60 && !p.business && r() < (p.formal ? 0.025 : 0.05) * (p.focus === 'work' ? 0.6 : 1) * layoffK(p) * k * (soc ? 0.3 : 1)) {
    if (soc) {
      p.jobYears = 0;
      log(p, L('職場が人を減らすことになり、国の斡旋で別の職場に割り当てられた。', 'The workplace was cutting staff, and the state assigned a job at another enterprise.'), 'work');
      return;
    }
    log(p, r() < 0.5 ? L('会社が人を減らし、仕事を失った。', 'Lost the job in a round of layoffs.') : L('仕事がなくなった。', 'The work dried up.'), 'hard');
    bump(p, { happy: -8 });
    // 次の仕事までの長さ: 平均は世界の平均 (失業率5%) の国で約1年3か月、国の失業率で伸び縮みする (指数分布)
    const months = Math.max(1, Math.round(-Math.log(1 - r()) * 15 * k));
    if (months < 12) {
      log(p, L(`${months}か月探して、次の仕事の話が来た。`, `After ${months} month${months === 1 ? '' : 's'} of looking, a new job came up.`), 'work');
      jobSearch(p, false);
    } else p.unemployed = Math.round(months / 12);
    return;
  }
  // 資格をとって3年は、昇進が少ししやすい (events/career.ts)
  if (r() < (p.focus === 'work' ? 0.08 : 0.03) + ((p.certUntil ?? -1) >= p.age ? 0.02 : 0)) {
    p.incomeP = clamp(p.incomeP + 0.06, 0, 0.99);
    log(p, L(`働きぶりが認められ、収入が上がった(年収 ${formatMoney(earnings(c, p.incomeP))})。`, `Good work was noticed; pay went up (${formatMoney(earnings(c, p.incomeP))} a year).`), 'work');
    bump(p, { happy: 4 });
  }
  if (!p.selfEmployed && p.age >= 33 && p.age <= 55 && p.jobYears >= 5 && r() < 0.06 && !p.job?.endsWith('(リーダー)')) leadOffer(p, c); // すでにリーダーなら打診しない (乱数は同じだけ引く)
  if (!p.selfEmployed && p.age >= 28 && p.age <= 55 && r() < 0.03) moveOffer(p, c);
  career(p);
  if (p.working && !p.retired && p.unemployed === 0) retirement(p, c);
}

// 失業率 (%、ILO 模型推計 2023、ILOSTAT)。表に無い国は世界の平均に近い5.5%
// ponytail: 今の年の値を、どの時代にも使う。不況の年の上がり下がりは market.ts の layoffK が受け持つ
const UNEMP: Record<string, number> = {
  ZAF: 32.1, ESP: 12.2, GRC: 11.1, TUR: 9.4, ITA: 7.7, FRA: 7.3, BRA: 8.0, USA: 3.6, DEU: 3.0, JPN: 2.6, KOR: 2.7, MEX: 2.8, IND: 4.2,
  CHN: 4.7, NGA: 3.1, RUS: 3.2, GBR: 4.0, CAN: 5.4, AUS: 3.7, POL: 2.8, NLD: 3.6, SWE: 7.6, FIN: 7.2, IRN: 9.0, EGY: 7.3, SAU: 4.9,
  ARG: 6.1, COL: 10.2, CHL: 8.7, PER: 4.6, IDN: 3.4, PHL: 2.2, VNM: 1.6, THA: 0.9, PAK: 5.4, BGD: 5.1, ETH: 3.5, KEN: 5.7, MAR: 9.1,
  DZA: 11.8, TUN: 15.1, JOR: 17.9, IRQ: 15.5, IRL: 4.3, PRT: 6.5, BEL: 5.5, AUT: 5.1, CHE: 4.1, NOR: 3.6, DNK: 5.1, CZE: 2.6,
  HUN: 4.1, ROU: 5.6, ARM: 8.6, GEO: 11.6, MKD: 13.1, SRB: 9.4, ALB: 11.0, NAM: 19.4, BWA: 23.4, LSO: 16.4, SWZ: 33.3, ISR: 3.5,
  NZL: 3.7, MYS: 3.5, SGP: 3.0, KHM: 0.3, MMR: 3.0, TZA: 2.6, UGA: 2.9, GHA: 3.0, AGO: 14.6, ZMB: 5.9, URY: 8.4, ECU: 3.8, BOL: 3.1,
};
// 失業率5%の国と比べた倍率。仕事を失う確率と、次が見つかるまでの長さの両方に、比の平方根ずつかける
export const unempK = (c: Country): number => {
  const u = (UNEMP[c.code] ?? 5.5) / 100;
  return Math.sqrt((u / (1 - u)) / (0.05 / 0.95));
};

function leadOffer(p: Person, c: Country): void {
  decide(p, {
    title: L('リーダーを任される？', 'Lead the team?'),
    text: L(`${p.job}として${p.jobYears}年。チームをまとめる役を打診された。`, `${p.jobYears} years as ${jobName(p.job ?? '')}. Offered the role of team lead.`),
    options: [
      {
        label: L('引き受ける', 'Accept'), hint: L('収入は上がるが、忙しくなる', 'More pay, more hours'),
        apply: (q) => {
          q.incomeP = clamp(q.incomeP + 0.08, 0, 0.99);
          q.job = `${q.job}(リーダー)`.replace('(リーダー)(リーダー)', '(リーダー)');
          log(q, L(`チームのリーダーになった。年収 ${formatMoney(earnings(c, q.incomeP))}。`, `Became team lead. ${formatMoney(earnings(c, q.incomeP))} a year.`), 'work', true);
          bump(q, { health: -3, bond: -2, happy: 3 });
        },
      },
      { label: L('断る', 'Decline'), hint: L('今の働き方を続ける', 'Keep working as now'), apply: (q) => log(q, L('リーダーの話は断った。', 'Turned down the team lead role.'), 'work') },
    ],
    auto: (q) => (q.focus === 'work' || q.rng() < 0.5 ? 0 : 1),
  });
}

function moveOffer(p: Person, c: Country): void {
  const better = clamp(p.incomeP + 0.05 + p.rng() * 0.05, 0, 0.99);
  decide(p, {
    title: L('転職の誘い', 'Job offer'),
    text: L(`同じ${p.job?.replace('(リーダー)', '')}の仕事で、条件のいい職場から声がかかった。`, `Another employer offered better terms for the same work (${jobName(p.job?.replace('(リーダー)', '') ?? '')}).`),
    options: [
      {
        label: L('移る', 'Move'), hint: L(`年収 ${formatMoney(earnings(c, better))}`, `${formatMoney(earnings(c, better))} a year`),
        apply: (q) => { q.incomeP = better; q.jobYears = 0; log(q, L('条件のいい職場に移った。', 'Moved to a better-paying job.'), 'work'); bump(q, { happy: 2, bond: -1 }); },
      },
      { label: L('今の職場に残る', 'Stay'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.5 ? 0 : 1),
  });
}

function retirement(p: Person, c: Country): void {
  // 会社の持ち主は、経営を任せて配当で暮らすかを自分で決める
  if (p.business) {
    if (!businessRetire(p) && (p.age >= 80 || p.stats.health < 30)) retire(p, L('体が利かなくなり、会社を人に任せた。', 'The body gave out, and the company passed to other hands.'));
    return;
  }
  const pensionCountry = c.gdp > 15000 && p.formal;
  const rule = pensionCountry ? pensionRule(p, c) : undefined;
  // 職ごとの定年や、介護・体・契約の終わり。体を壊して辞めた人は、障害の年金としてすぐ受け取る。ほかは年金の年齢から
  const why = leaveReason(p, c);
  if (why) { retire(p, why, rule && p.stats.health >= 40 ? Math.max(p.age, rule.age) : p.age); return; }
  if (rule) {
    if (p.age >= 72) { retire(p, L('定年で仕事を引退した。', 'Retired at the mandatory age.')); return; }
    const e = rule.early;
    if (e && p.age >= e.age && p.age < rule.age && contribOf(p) >= e.years && p.recent.earlyPension === undefined) { earlyPension(p, rule, e); return; }
    if (p.age >= 55 && p.age < rule.age && (p.age - 55) % 3 === 0 && enoughSaved(p)) { earlyRetire(p, rule); return; }
    if (p.age >= rule.age && (p.age - rule.age) % 2 === 0) {
      // 年金の年齢を過ぎても働き続ける人の割合は国で違う (pension.ts の stay)。表に無い国は、これまでどおり65歳ごろに引退する
      const first = p.age === rule.age;
      // 2回目からは2年ごとに55%が辞める。ただし年金の年齢を過ぎても多くが働く国 (日本・韓国) はその割合のまま
      const leave = c.code in STAY_KNOWN ? (first ? 1 - rule.stay : Math.min(0.55, 1 - rule.stay)) : (p.age >= 65 ? 1 : 0);
      decide(p, {
        title: L('引退する？', 'Retire?'),
        text: L(`${p.age}歳。年金を受け取れる年になった。`, `Age ${p.age}. Old enough to draw a pension.`),
        options: [
          { label: L('引退する', 'Retire'), hint: L('年金で暮らす・ゆとり↑', 'Live on the pension, more time ↑'), apply: (q) => retire(q, L('仕事を引退し、年金で暮らし始めた。', 'Retired and began living on a pension.')) },
          { label: L('もう少し働く', 'Keep working'), apply: () => {} },
        ],
        auto: (q) => (q.stats.health < 25 || q.rng() < leave ? 0 : 1),
      });
    }
    return;
  }
  if (p.age >= 74 || (p.age >= 60 && p.stats.health < 35)) {
    retire(p, p.formal && c.gdp > 8000
      ? L('仕事を辞め、わずかな年金で暮らす。', 'Stopped working. Lives on a small pension.')
      : L('体が利かなくなり、働けなくなった。子どもや親族を頼って暮らす。', 'The body gave out and work was no longer possible. Lives with help from children and relatives.'));
  }
}

// at: 年金を受け取り始める年齢 (省けば今から)
function retire(p: Person, text: string, at = p.age): void {
  p.retired = true;
  p.pensionAt = at;
  log(p, text, 'old', true);
}

// pension.ts の表にある国 (年金の年齢を過ぎて働き続ける割合が分かる国)
const STAY_KNOWN = { USA: 1, DEU: 1, FRA: 1, ITA: 1, ESP: 1, JPN: 1, KOR: 1, GBR: 1, RUS: 1, CHN: 1 };

// 法律の決まりで、年金の年齢より前に受け取って引退できる (米国62歳・ドイツ63歳・フランスとイタリアの長い加入・スペインの2年前・日本の繰上げ・韓国の早期年金)
function earlyPension(p: Person, rule: Rule, e: Early): void {
  p.recent.earlyPension = p.age;
  const cut = Math.round(e.cut * 100);
  decide(p, {
    title: L('年金を早めに受け取る？', 'Draw the pension early?'),
    text: L(`${p.age}歳。年金は${rule.age}歳からだが、${e.why}。`, `Age ${p.age}. The pension normally starts at ${rule.age}, but ${e.why.charAt(0).toLowerCase() + e.why.slice(1)}.`),
    stat: cut ? L(`早めに受け取ると、年金はずっと${cut}%少ないまま`, `Drawing early leaves the pension ${cut}% lower for good`) : undefined,
    options: [
      { label: L('早めに引退する', 'Retire early'), hint: cut ? L(`年金${cut}%減・ゆとり↑`, `Pension -${cut}%, more time ↑`) : L('減額なし・ゆとり↑', 'No cut, more time ↑'),
        apply: (q) => { q.pensionCut = e.cut; retire(q, cut ? L(`${q.age}歳で、減った年金を早めに受け取って引退した。`, `Retired at ${q.age}, drawing a reduced pension early.`) : L(`長く働いてきたので、${q.age}歳で減額なしの年金を受け取って引退した。`, `After a long working life, retired at ${q.age} on a full pension.`)); } },
      { label: L(`${rule.age}歳まで働く`, `Work on to ${rule.age}`), apply: () => {} },
    ],
    // 体の値は60代でたいてい20〜40 (実測)。ここで辞めるのは、とても弱った人だけ
    auto: (q) => (q.stats.health < 20 || q.rng() < rule.claim ? 0 : 1),
  });
}

// 蓄えが十分なら、年金の年齢より前でも辞められる。年金の年齢までは蓄えで暮らす (4%ルール: 年の暮らしの25倍の蓄え。Bengen 1994)
const enoughSaved = (p: Person) => p.wealth >= currentIncome(p) * 0.8 * 25;
function earlyRetire(p: Person, rule: Rule): void {
  decide(p, {
    title: L('早めに引退しようか？', 'Retire early?'),
    text: L(`${p.age}歳。蓄えは${formatMoney(p.wealth)}。年金は${rule.age}歳から出る。それまでは蓄えで暮らすことになる。`, `Age ${p.age}. Savings: ${formatMoney(p.wealth)}. The pension starts at ${rule.age}; until then, savings would have to cover everything.`),
    stat: L('年に蓄えの4%ずつ使えば、30年ほどもつことが多い (Bengen 1994 の4%ルール)', 'Spending 4% of savings a year usually lasts about 30 years (the 4% rule, Bengen 1994)'),
    options: [
      { label: L('早めに辞める', 'Stop working now'), hint: L('ゆとり↑・収入は年金まで無し', 'More time ↑, no income until the pension'), apply: (q) => retire(q, L(`${q.age}歳で仕事を辞めた。年金の年齢までは蓄えで暮らす。`, `Stopped working at ${q.age}. Savings would carry things until the pension.`), rule.age) },
      { label: L('まだ働く', 'Keep working'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.3 ? 0 : 1),
  });
}
