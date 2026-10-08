// 仕事: 職を選ぶ・失う・昇進する・辞める。
import type { Country } from '../countries';
import { earnings, formatMoney, monthlyYen } from '../economy';
import { L, isEn } from '../../i18n';
import { offerFor, pickOffers, jobName, JOBS, type Offer } from '../jobs';
import { bump, countryOf, decide, eduLevel, log, type Person } from '../person';
import { clamp, normal } from '../rng';
import { shared } from '../bonds';

function takeJob(p: Person, o: Offer, first: boolean): void {
  p.working = true;
  p.unemployed = 0;
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
      ...(p.age >= 16 ? [{
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
  // 学校を出たのに仕事のない大人は、毎年もう一度仕事を探す
  if (!p.working && !p.homemaker && !p.retired && p.age >= 16 && p.age < 60 && !p.school.enrolled
    && p.school.uni !== 'studying' && p.school.grad !== 'studying' && p.military !== 'serving' && p.pending.length === 0) {
    startWork(p);
    return;
  }
  if (!p.working || p.retired || p.school.uni === 'studying' || p.school.grad === 'studying' || p.military === 'serving') return;
  if (p.unemployed > 0) {
    p.unemployed--;
    if (p.unemployed === 0) jobSearch(p, false);
    return;
  }
  p.jobYears++;
  p.incomeP = clamp(p.incomeP + normal(r, p.focus === 'work' ? 0.012 : 0.002, 0.025), 0.01, 0.99);
  if (p.age < 60 && r() < (p.formal ? 0.025 : 0.05) * (p.focus === 'work' ? 0.6 : 1)) {
    p.unemployed = 1 + Math.floor(r() * 2);
    log(p, r() < 0.5 ? L('会社が人を減らし、仕事を失った。', 'Lost the job in a round of layoffs.') : L('仕事がなくなった。', 'The work dried up.'), 'hard');
    bump(p, { happy: -8 });
    return;
  }
  if (r() < (p.focus === 'work' ? 0.08 : 0.03)) {
    p.incomeP = clamp(p.incomeP + 0.06, 0, 0.99);
    log(p, L(`働きぶりが認められ、収入が上がった(年収 ${formatMoney(earnings(c, p.incomeP))})。`, `Good work was noticed; pay went up (${formatMoney(earnings(c, p.incomeP))} a year).`), 'work');
    bump(p, { happy: 4 });
  }
  if (!p.selfEmployed && p.age >= 33 && p.age <= 55 && p.jobYears >= 5 && r() < 0.06) leadOffer(p, c);
  if (!p.selfEmployed && p.age >= 28 && p.age <= 55 && r() < 0.03) moveOffer(p, c);
  retirement(p, c);
}

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
  const pensionCountry = c.gdp > 15000 && p.formal;
  if (pensionCountry && p.age >= 60) {
    if (p.age >= 68) { retire(p, L('定年で仕事を引退した。', 'Retired at the mandatory age.')); return; }
    if (p.age % 2 === 0) {
      decide(p, {
        title: L('引退する？', 'Retire?'),
        text: L(`${p.age}歳。年金を受け取れる年になった。`, `Age ${p.age}. Old enough to draw a pension.`),
        options: [
          { label: L('引退する', 'Retire'), hint: L('年金で暮らす', 'Live on the pension'), apply: (q) => retire(q, L('仕事を引退し、年金で暮らし始めた。', 'Retired and began living on a pension.')) },
          { label: L('もう少し働く', 'Keep working'), apply: () => {} },
        ],
        auto: (q) => (q.age >= 65 || q.stats.health < 45 ? 0 : 1),
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

function retire(p: Person, text: string): void {
  p.retired = true;
  log(p, text, 'old', true);
}
