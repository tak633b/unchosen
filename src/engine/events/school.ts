// 学校・大学・留学・兵役。
import { COUNTRIES, byCode, type Country } from '../countries';
import { earnings, formatMoney } from '../economy';
import { MAJORS } from '../jobs';
import { bump, countryOf, decide, log, type Person } from '../person';
import { clamp, pickWeighted } from '../rng';
import { startWork } from './work';

const levelOf = (years: number) =>
  years >= 12 ? '高校を卒業した' : years >= 9 ? '中学校を卒業した' : years >= 6 ? '小学校を卒業した' : `小学校を${Math.round(years)}年で離れた`;

export function schooling(p: Person): void {
  const c = countryOf(p);
  if (p.military === 'serving') return;
  if (p.school.uni === 'studying') return university(p);
  if (p.school.grad === 'studying') return gradSchool(p);
  // 入学した年はまだ1年を終えていない。6歳で入って18歳で12年を終える
  if (!p.school.enrolled || p.age <= 6) return;
  p.school.years++;
  bump(p, { learn: 4 + (p.focus === 'learn' ? 3 : 0) });
  const y = p.school.years;
  if (y === 6) log(p, '小学校を卒業した。', 'school');
  if (y === 9 && p.school.target > 9) {
    log(p, '中学校を卒業した。', 'school');
    chooseTrack(p, c);
  }
  if (y >= 12) {
    p.school.enrolled = false;
    log(p, '高校を卒業した。', 'school', true);
    afterHighSchool(p, c);
    return;
  }
  if (y >= p.school.target) askToLeave(p);
}

function askToLeave(p: Person): void {
  if (p.age < 10) { leaveSchool(p); return; }
  decide(p, {
    title: '学校をやめる？',
    text: `家計が苦しく、${levelOf(p.school.years)}ところで働きに出るよう言われた。`,
    options: [
      {
        label: '学校を続けたいと頼む', hint: 'うまくいくとは限らない',
        apply: (q) => {
          if (q.rng() < 0.35 + q.stats.learn / 250) {
            q.school.target += 3;
            log(q, '頼み込んで、もう少し学校に通えることになった。', 'school');
          } else {
            log(q, '願いは聞き入れられなかった。', 'hard');
            leaveSchool(q);
          }
        },
      },
      { label: '働きに出る', apply: (q) => leaveSchool(q) },
    ],
    auto: (q) => (q.rng() < 0.2 ? 0 : 1),
  });
}

function leaveSchool(p: Person): void {
  p.school.enrolled = false;
  log(p, levelOf(p.school.years) + '。', 'school');
  if (p.age >= 10) startWork(p);
}

function chooseTrack(p: Person, c: Country): void {
  decide(p, {
    title: '進路',
    text: 'どんな高校に進む？',
    options: [
      { label: '普通科', hint: '大学に進むなら有利', apply: (q) => { q.school.track = 'general'; } },
      { label: '職業科', hint: '技術の仕事に就きやすい', apply: (q) => { q.school.track = 'vocational'; bump(q, { learn: 2 }); } },
    ],
    auto: (q) => (q.rng() < (c.tertiary > 0.4 ? 0.75 : 0.55) ? 0 : 1),
  });
}

// ---- 高校のあと ----------------------------------------------------------

export const uniChance = (p: Person, c: Country) =>
  clamp(Math.min(1, c.tertiary) * (0.5 + p.familyP) * (0.4 + p.stats.learn / 100) * (p.school.track === 'vocational' ? 0.6 : 1), 0.02, 0.95);

const tuitionOf = (c: Country, abroad: boolean) => earnings(c, 0.5) * (abroad ? 0.9 : 0.25);

// 留学先: 留学生を多く受け入れる豊かな国
const studyDest = (p: Person) => pickWeighted(p.rng, COUNTRIES.filter((d) => d.gdp > 35000 && d.code !== p.country), (d) => d.pop * (['USA', 'GBR', 'AUS', 'CAN', 'DEU', 'FRA', 'JPN'].includes(d.code) ? 4 : 1));

function afterHighSchool(p: Person, c: Country): void {
  const chance = uniChance(p, c);
  const canAbroad = p.familyP > 0.7 && c.gdp < 40000;
  const abroad = canAbroad ? studyDest(p) : null;
  decide(p, {
    title: '高校のあと',
    text: `${c.name}で大学に進む人は同世代の約${Math.round(Math.min(1, c.tertiary) * 100)}%。`,
    stat: '大学には学力だけでなく、家の豊かさと定員の壁がある',
    options: [
      {
        label: '大学を受験する', hint: `合格の見込み ${Math.round(chance * 100)}%`,
        apply: (q) => {
          if (q.rng() < chance) enterUni(q, c, null);
          else { log(q, '大学には受からなかった。', 'school'); startWork(q); }
        },
      },
      { label: '働き始める', hint: '早くからお金を稼ぐ', apply: (q) => startWork(q) },
      ...(abroad ? [{
        label: `${abroad.name}に留学する`, hint: 'お金はかかるが、道も広がる',
        apply: (q: Person) => enterUni(q, c, abroad),
      }] : []),
    ],
    auto: (q) => (abroad && q.rng() < 0.15 ? 2 : q.rng() < chance * 1.1 ? 0 : 1),
  });
}

function enterUni(p: Person, home: Country, abroad: Country | null): void {
  p.school.uni = 'studying';
  p.school.uniYears = 0;
  const cost = tuitionOf(abroad ?? home, !!abroad) * 4;
  const parents = cost * clamp(p.familyP * 0.9, 0, 0.9);
  p.wealth -= cost - parents;
  if (abroad) {
    p.school.abroad = abroad.code;
    p.country = abroad.code;
    p.city = null;
    if (!p.countriesLived.includes(abroad.code)) p.countriesLived.push(abroad.code);
    log(p, `${abroad.name}の大学に合格し、留学した。費用 ${formatMoney(cost)} のうち ${formatMoney(parents)} は親が出し、残りは借金になった。`, 'move', true);
  } else {
    log(p, `大学に合格した。学費は4年で ${formatMoney(cost)}。${cost - parents > 1 ? `うち ${formatMoney(cost - parents)} は奨学金と借金でまかなう。` : ''}`, 'school', true);
  }
  bump(p, { happy: 8 });
  chooseMajor(p);
}

function chooseMajor(p: Person): void {
  const med = p.stats.learn >= 80;
  const list = MAJORS.filter((m) => m !== '医学' || med);
  const shown = [...list].sort(() => p.rng() - 0.5).slice(0, 5);
  decide(p, {
    title: '何を学ぶ？',
    text: `専攻を決める時期になった。専攻は最初の仕事を大きく左右する。${med ? '' : '医学部の合格ラインには少し届かなかった。'}`,
    options: shown.map((m) => ({
      label: m,
      apply: (q: Person) => { q.school.major = m; log(q, `${m}を専攻することにした。`, 'school'); },
    })),
    auto: (q) => Math.floor(q.rng() * shown.length),
  });
}

function university(p: Person): void {
  p.school.uniYears++;
  bump(p, { learn: 5 + (p.focus === 'learn' ? 3 : 0) });
  const years = p.school.major === '医学' ? 6 : 4;
  if (p.school.uniYears < years) return;
  p.school.uni = 'done';
  log(p, `大学を卒業した(${p.school.major ?? '学士'})。`, 'school', true);
  afterUni(p);
}

function afterUni(p: Person): void {
  const abroad = p.school.abroad ? byCode(p.school.abroad) : null;
  const home = byCode(p.birthCountry);
  const opts = [
    { label: abroad ? `${abroad.name}に残って仕事を探す` : '仕事を探す', hint: abroad ? '就労ビザが要る' : undefined, apply: (q: Person) => stayOrWork(q) },
    ...(abroad ? [{ label: `${home.name}に帰って働く`, hint: '家族のそばへ', apply: (q: Person) => goHome(q) }] : []),
    ...(p.stats.learn >= 60 ? [{ label: '大学院に進む', hint: 'あと2年。専門職への道', apply: (q: Person) => { q.school.grad = 'studying'; q.school.uniYears = 0; log(q, '大学院に進んだ。', 'school'); } }] : []),
  ];
  decide(p, {
    title: '卒業のあと',
    text: abroad ? `${abroad.name}で学位をとった。どこで、何をする？` : '学位をとった。次は？',
    stat: abroad ? '留学生が卒業後もその国に残って働く割合は、国やビザ制度によって2〜6割ほど (OECD 2022)' : undefined,
    options: opts,
    auto: (q) => (q.stats.learn >= 75 && opts.length === 3 && q.rng() < 0.3 ? 2 : abroad && q.rng() < 0.45 ? 1 : 0),
  });
}

function stayOrWork(p: Person): void {
  if (p.school.abroad && p.rng() < 0.35) {
    log(p, '就労ビザが下りず、帰国することになった。', 'hard');
    goHome(p);
    return;
  }
  if (p.school.abroad) { p.migratedTo = p.school.abroad; p.city = null; }
  startWork(p);
}

function goHome(p: Person): void {
  p.country = p.birthCountry;
  p.migratedTo = undefined;
  log(p, `${byCode(p.birthCountry).name}に帰った。`, 'move');
  startWork(p);
}

function gradSchool(p: Person): void {
  p.school.uniYears++;
  bump(p, { learn: 5 });
  if (p.school.uniYears < 2) return;
  p.school.grad = 'done';
  log(p, '大学院を修了し、修士号をとった。', 'school', true);
  if (p.school.abroad && p.country !== p.birthCountry) {
    const abroad = byCode(p.school.abroad);
    decide(p, {
      title: '修了のあと',
      text: `${abroad.name}で大学院を終えた。どこで働く？`,
      options: [
        { label: `${abroad.name}に残る`, hint: '就労ビザが要る', apply: (q) => stayOrWork(q) },
        { label: `${byCode(p.birthCountry).name}に帰る`, apply: (q) => goHome(q) },
      ],
      auto: (q) => (q.rng() < 0.55 ? 0 : 1),
    });
  } else {
    startWork(p);
  }
}

// ---- 兵役 -----------------------------------------------------------------

// 男性に兵役のある国と、おおよその期間 (月)
const CONSCRIPTION: Record<string, number> = {
  KOR: 18, ISR: 32, VNM: 24, TUR: 12, EGY: 24, IRN: 21, RUS: 12, SGP: 24, THA: 24, DZA: 12, AUT: 6, NOR: 12,
  FIN: 9, DNK: 4, GRC: 12, CYP: 14, ARM: 24, AZE: 18, GEO: 12, UKR: 18, BLR: 18, KAZ: 12, UZB: 12, TKM: 24,
  MNG: 12, CHE: 6, SYR: 24, ERI: 18,
};

export function military(p: Person): void {
  const months = CONSCRIPTION[p.birthCountry];
  const eligible = p.sex === 'M' || (p.birthCountry === 'ISR' && p.age === 18);
  if (!months || !eligible) return;
  if (p.military === 'serving') {
    if (p.age >= (p.serviceEnd ?? 0)) {
      p.military = 'done';
      log(p, '兵役を終えて除隊した。', 'work');
      if (!p.working && !p.school.enrolled && p.school.uni !== 'studying') startWork(p);
    }
    return;
  }
  const due = (p.military === 'none' && p.age === 19) || (p.military === 'deferred' && p.age === 24 && p.school.uni !== 'studying');
  if (!due || p.country !== p.birthCountry) return;
  const student = p.school.uni === 'studying' || p.school.grad === 'studying';
  decide(p, {
    title: '入営の通知',
    text: `${byCode(p.birthCountry).name}では男性に兵役の義務がある。期間はおよそ${months}か月。`,
    options: [
      {
        label: '入隊する', hint: `${months}か月`,
        apply: (q) => {
          q.military = 'serving';
          q.serviceEnd = q.age + Math.ceil(months / 12);
          q.working = false;
          log(q, '入隊した。', 'work', true);
          bump(q, { health: 2, bond: -3 });
        },
      },
      ...(student && p.military === 'none' ? [{ label: '入隊を延ばす', hint: '学業を理由に', apply: (q: Person) => { q.military = 'deferred'; } }] : []),
    ],
    auto: (q) => (student && q.rng() < 0.6 && p.military === 'none' ? 1 : 0),
  });
}
