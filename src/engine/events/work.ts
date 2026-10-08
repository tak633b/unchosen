// 仕事: 職を選ぶ・失う・昇進する・辞める。
import type { Country } from '../countries';
import { earnings, formatMoney, monthlyYen } from '../economy';
import { offerFor, pickOffers, JOBS, type Offer } from '../jobs';
import { bump, countryOf, decide, eduLevel, log, type Person } from '../person';
import { clamp, normal } from '../rng';

function takeJob(p: Person, o: Offer, first: boolean): void {
  p.working = true;
  p.unemployed = 0;
  p.job = o.job.name;
  p.jobKind = o.job.kind;
  p.selfEmployed = /自分の畑|露天商|日雇い|市場の店主|漁師|家畜/.test(o.job.name);
  p.jobYears = 0;
  p.incomeP = o.p;
  p.formal = o.formal;
  log(p, `${o.job.name}として働き始めた。年収 ${formatMoney(o.pay)}${o.formal ? '' : '(非正規)'}。`, 'work', first);
}

const offerLabel = (o: Offer) => ({
  label: o.job.name,
  hint: `年収 $${Math.round(o.pay).toLocaleString()}・日本の感覚で月${monthlyYen(o.pay)}・${o.formal ? '正規(年金・保険あり)' : '非正規'}`,
});

export function jobSearch(p: Person, title = '最初の仕事を選ぶ'): void {
  const c = countryOf(p);
  const edu = eduLevel(p);
  const offers = pickOffers(p, c, edu, p.rng);
  if (!offers.length) { p.working = true; p.job = '日雇いの仕事'; p.jobKind = 'manual'; p.incomeP = 0.15; return; }
  const informal = c.gdp < 5000 ? 85 : c.gdp < 15000 ? 60 : c.gdp < 30000 ? 30 : 12;
  decide(p, {
    title,
    text: `学歴: ${['なし', '小学校', '中学校', '高校', '大学', '大学院'][edu]}。${c.name}の${p.rural ? '村' : '町'}で見つかった仕事。`,
    stat: `${c.name}では働く人のおよそ${informal}%が非正規の仕事に就いている (ILO の推計にもとづく目安)`,
    options: [
      ...offers.map((o) => ({ ...offerLabel(o), apply: (q: Person) => takeJob(q, o, title === '最初の仕事を選ぶ') })),
      ...(p.age >= 16 ? [{
        label: 'もっといい仕事を待つ', hint: 'もう1年探す',
        apply: (q: Person) => { q.unemployed = 1; q.working = true; log(q, '仕事を探し続けた。', 'work'); },
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
    log(p, '学校をやめ、家で母親を手伝って家事と弟や妹の世話をするようになった。', 'family');
    p.homemaker = true;
    return true;
  }
  decide(p, {
    title: '外で働く？',
    text: '家族は、あなたが外で働くより家のことをするよう望んでいる。',
    stat: `${c.name}では、15歳以上の女性のうち働いている(仕事を探している)のはおよそ${Math.round(c.flfp * 100)}% (ILO)`,
    options: [
      { label: '外で働く', hint: '家族とぶつかるかもしれない', apply: (q) => { bump(q, { bond: -4 }); jobSearch(q); } },
      { label: '家のことをする', hint: '収入は家族に頼る', apply: (q) => { q.working = false; q.job = undefined; q.homemaker = true; log(q, '家で家族の世話と家事をして暮らすことになった。', 'family'); } },
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
    if (p.unemployed === 0) jobSearch(p, '新しい仕事を選ぶ');
    return;
  }
  p.jobYears++;
  p.incomeP = clamp(p.incomeP + normal(r, p.focus === 'work' ? 0.012 : 0.002, 0.025), 0.01, 0.99);
  if (p.age < 60 && r() < (p.formal ? 0.025 : 0.05) * (p.focus === 'work' ? 0.6 : 1)) {
    p.unemployed = 1 + Math.floor(r() * 2);
    log(p, r() < 0.5 ? '会社が人を減らし、仕事を失った。' : '仕事がなくなった。', 'hard');
    bump(p, { happy: -8 });
    return;
  }
  if (r() < (p.focus === 'work' ? 0.08 : 0.03)) {
    p.incomeP = clamp(p.incomeP + 0.06, 0, 0.99);
    log(p, `働きぶりが認められ、収入が上がった(年収 ${formatMoney(earnings(c, p.incomeP))})。`, 'work');
    bump(p, { happy: 4 });
  }
  if (!p.selfEmployed && p.age >= 33 && p.age <= 55 && p.jobYears >= 5 && r() < 0.06) leadOffer(p, c);
  if (!p.selfEmployed && p.age >= 28 && p.age <= 55 && r() < 0.03) moveOffer(p, c);
  retirement(p, c);
}

function leadOffer(p: Person, c: Country): void {
  decide(p, {
    title: 'リーダーを任される？',
    text: `${p.job}として${p.jobYears}年。チームをまとめる役を打診された。`,
    options: [
      {
        label: '引き受ける', hint: '収入は上がるが、忙しくなる',
        apply: (q) => {
          q.incomeP = clamp(q.incomeP + 0.08, 0, 0.99);
          q.job = `${q.job}(リーダー)`.replace('(リーダー)(リーダー)', '(リーダー)');
          log(q, `チームのリーダーになった。年収 ${formatMoney(earnings(c, q.incomeP))}。`, 'work', true);
          bump(q, { health: -3, bond: -2, happy: 3 });
        },
      },
      { label: '断る', hint: '今の働き方を続ける', apply: (q) => log(q, 'リーダーの話は断った。', 'work') },
    ],
    auto: (q) => (q.focus === 'work' || q.rng() < 0.5 ? 0 : 1),
  });
}

function moveOffer(p: Person, c: Country): void {
  const better = clamp(p.incomeP + 0.05 + p.rng() * 0.05, 0, 0.99);
  decide(p, {
    title: '転職の誘い',
    text: `同じ${p.job?.replace('(リーダー)', '')}の仕事で、条件のいい職場から声がかかった。`,
    options: [
      {
        label: '移る', hint: `年収 ${formatMoney(earnings(c, better))}`,
        apply: (q) => { q.incomeP = better; q.jobYears = 0; log(q, '条件のいい職場に移った。', 'work'); bump(q, { happy: 2, bond: -1 }); },
      },
      { label: '今の職場に残る', apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.5 ? 0 : 1),
  });
}

function retirement(p: Person, c: Country): void {
  const pensionCountry = c.gdp > 15000 && p.formal;
  if (pensionCountry && p.age >= 60) {
    if (p.age >= 68) { retire(p, '定年で仕事を引退した。'); return; }
    if (p.age % 2 === 0) {
      decide(p, {
        title: '引退する？',
        text: `${p.age}歳。年金を受け取れる年になった。`,
        options: [
          { label: '引退する', hint: '年金で暮らす', apply: (q) => retire(q, '仕事を引退し、年金で暮らし始めた。') },
          { label: 'もう少し働く', apply: () => {} },
        ],
        auto: (q) => (q.age >= 65 || q.stats.health < 45 ? 0 : 1),
      });
    }
    return;
  }
  if (p.age >= 74 || (p.age >= 60 && p.stats.health < 35)) {
    retire(p, p.formal && c.gdp > 8000 ? '仕事を辞め、わずかな年金で暮らす。' : '体が利かなくなり、働けなくなった。子どもや親族を頼って暮らす。');
  }
}

function retire(p: Person, text: string): void {
  p.retired = true;
  log(p, text, 'old', true);
}
