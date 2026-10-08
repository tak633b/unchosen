// 学校・大学・留学・兵役。
import { COUNTRIES, byCode, countriesAt, type Country } from '../countries';
import { earnings, formatMoney } from '../economy';
import { L, isEn } from '../../i18n';
import { MAJORS, majorName } from '../jobs';
import { bump, countryOf, decide, log, yearOf, type Person } from '../person';
import { clamp, pickWeighted } from '../rng';
import { startWork } from './work';
import { because, schoolWhy } from '../why';

const levelOf = (years: number) => isEn
  ? (years >= 12 ? 'finished high school' : years >= 9 ? 'finished middle school' : years >= 6 ? 'finished primary school' : `left primary school after ${Math.round(years)} years`)
  : (years >= 12 ? '高校を卒業した' : years >= 9 ? '中学校を卒業した' : years >= 6 ? '小学校を卒業した' : `小学校を${Math.round(years)}年で離れた`);
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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
  if (y === 6) log(p, L('小学校を卒業した。', 'Finished primary school.'), 'school');
  if (y === 9 && p.school.target > 9) {
    log(p, L('中学校を卒業した。', 'Finished middle school.'), 'school');
    chooseTrack(p, c);
  }
  if (y >= 12) {
    p.school.enrolled = false;
    log(p, L('高校を卒業した。', 'Finished high school.'), 'school', true);
    afterHighSchool(p, c);
    return;
  }
  if (y >= p.school.target) askToLeave(p);
}

function askToLeave(p: Person): void {
  if (p.age < 10) { leaveSchool(p); return; }
  decide(p, {
    title: L('学校をやめる？', 'Leave school?'),
    text: isEn ? `Money is tight at home. Having ${levelOf(p.school.years)}, you are told to go out and work.` : `家計が苦しく、${levelOf(p.school.years)}ところで働きに出るよう言われた。`,
    options: [
      {
        label: L('学校を続けたいと頼む', 'Ask to stay in school'), hint: L('うまくいくとは限らない', 'It may not work'),
        apply: (q) => {
          if (q.rng() < 0.35 + q.stats.learn / 250) {
            q.school.target += 3;
            log(q, L('頼み込んで、もう少し学校に通えることになった。', 'Begged, and was allowed a few more years of school.'), 'school');
          } else {
            log(q, L('願いは聞き入れられなかった。', 'The request was refused.'), 'hard');
            leaveSchool(q);
          }
        },
      },
      { label: L('働きに出る', 'Go to work'), apply: (q) => leaveSchool(q) },
    ],
    auto: (q) => (q.rng() < 0.2 ? 0 : 1),
  });
}

function leaveSchool(p: Person): void {
  p.school.enrolled = false;
  log(p, isEn ? capital(levelOf(p.school.years)) + '.' : levelOf(p.school.years) + '。', 'school');
  if (p.school.years < 12) because(p, schoolWhy(p, countryOf(p)));
  if (p.age >= 10) startWork(p);
}

function chooseTrack(p: Person, c: Country): void {
  decide(p, {
    title: L('進路', 'High school'),
    text: L('どんな高校に進む？', 'What kind of high school?'),
    options: [
      { label: L('普通科', 'Academic'), hint: L('大学に進むなら有利', 'Better for university'), apply: (q) => { q.school.track = 'general'; } },
      { label: L('職業科', 'Vocational'), hint: L('技術の仕事に就きやすい', 'Easier path to skilled trades'), apply: (q) => { q.school.track = 'vocational'; bump(q, { learn: 2 }); } },
    ],
    auto: (q) => (q.rng() < (c.tertiary > 0.4 ? 0.75 : 0.55) ? 0 : 1),
  });
}

// ---- 高校のあと ----------------------------------------------------------

export const uniChance = (p: Person, c: Country) =>
  clamp(Math.min(1, c.tertiary) * (0.5 + p.familyP) * (0.4 + p.stats.learn / 100) * (p.school.track === 'vocational' ? 0.6 : 1), 0.02, 0.95);

const tuitionOf = (c: Country, abroad: boolean) => earnings(c, 0.5) * (abroad ? 0.9 : 0.25);

// 留学先: 留学生を多く受け入れる豊かな国
const studyDest = (p: Person) => pickWeighted(p.rng, countriesAt(yearOf(p)).filter((d) => d.gdp > 35000 && d.code !== p.country), (d) => d.pop * (['USA', 'GBR', 'AUS', 'CAN', 'DEU', 'FRA', 'JPN'].includes(d.code) ? 4 : 1));

function afterHighSchool(p: Person, c: Country): void {
  const chance = uniChance(p, c);
  const canAbroad = p.familyP > 0.7 && c.gdp < 40000;
  const abroad = canAbroad ? studyDest(p) : null;
  decide(p, {
    title: L('高校のあと', 'After high school'),
    text: L(`${c.name}で大学に進む人は同世代の約${Math.round(Math.min(1, c.tertiary) * 100)}%。`, `In ${c.name}, about ${Math.round(Math.min(1, c.tertiary) * 100)}% of this generation go on to university.`),
    stat: L('大学には学力だけでなく、家の豊かさと定員の壁がある', 'Getting in depends not only on grades but on family money and the number of places'),
    options: [
      {
        label: L('大学を受験する', 'Apply to university'), hint: L(`合格の見込み ${Math.round(chance * 100)}%`, `${Math.round(chance * 100)}% chance of admission`),
        apply: (q) => {
          const why = L(`合格の見込みは${Math.round(chance * 100)}%だった。${c.name}の大学進学率${Math.round(Math.min(1, c.tertiary) * 100)}%に、家の暮らし向きと学力をかけて決まる`,
            `The odds of getting in were ${Math.round(chance * 100)}%: ${c.name}'s ${Math.round(Math.min(1, c.tertiary) * 100)}% university rate, scaled by family money and grades`);
          if (q.rng() < chance) { enterUni(q, c, null); because(q, why); }
          else { log(q, L('大学には受からなかった。', 'Did not get into university.'), 'school'); because(q, why); startWork(q); }
        },
      },
      { label: L('働き始める', 'Start working'), hint: L('早くからお金を稼ぐ', 'Earn money sooner'), apply: (q) => startWork(q) },
      ...(abroad ? [{
        label: L(`${abroad.name}に留学する`, `Study in ${abroad.name}`), hint: L('お金はかかるが、道も広がる', 'Costly, but opens doors'),
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
    log(p, L(`${abroad.name}の大学に合格し、留学した。費用 ${formatMoney(cost)} のうち ${formatMoney(parents)} は親が出し、残りは借金になった。`, `Was admitted to a university in ${abroad.name} and moved there. Of the ${formatMoney(cost)} cost, parents paid ${formatMoney(parents)}; the rest became debt.`), 'move', true);
  } else {
    log(p, isEn
      ? `Got into university. Tuition for four years: ${formatMoney(cost)}.${cost - parents > 1 ? ` ${formatMoney(cost - parents)} of it to be covered by scholarships and loans.` : ''}`
      : `大学に合格した。学費は4年で ${formatMoney(cost)}。${cost - parents > 1 ? `うち ${formatMoney(cost - parents)} は奨学金と借金でまかなう。` : ''}`, 'school', true);
  }
  bump(p, { happy: 8 });
  chooseMajor(p);
}

function chooseMajor(p: Person): void {
  const med = p.stats.learn >= 80;
  // 情報科学の学科は1960年代半ばから
  const list = MAJORS.filter((m) => (m !== '医学' || med) && (m !== '情報科学' || yearOf(p) >= 1965));
  const shown = [...list].sort(() => p.rng() - 0.5).slice(0, 5);
  decide(p, {
    title: L('何を学ぶ？', 'What to study?'),
    text: isEn
      ? `Time to choose a major. It will shape the first job.${med ? '' : ' Grades fell just short of the bar for medicine.'}`
      : `専攻を決める時期になった。専攻は最初の仕事を大きく左右する。${med ? '' : '医学部の合格ラインには少し届かなかった。'}`,
    options: shown.map((m) => ({
      label: majorName(m),
      apply: (q: Person) => { q.school.major = m; log(q, L(`${m}を専攻することにした。`, `Chose to major in ${majorName(m)}.`), 'school'); },
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
  log(p, L(`大学を卒業した(${p.school.major ?? '学士'})。`, `Graduated from university (${p.school.major ? majorName(p.school.major) : 'bachelor\'s'}).`), 'school', true);
  afterUni(p);
}

function afterUni(p: Person): void {
  const abroad = p.school.abroad ? byCode(p.school.abroad) : null;
  const home = byCode(p.birthCountry);
  const opts = [
    { label: abroad ? L(`${abroad.name}に残って仕事を探す`, `Stay in ${abroad.name} and look for work`) : L('仕事を探す', 'Look for work'), hint: abroad ? L('就労ビザが要る', 'Needs a work visa') : undefined, apply: (q: Person) => stayOrWork(q) },
    ...(abroad ? [{ label: L(`${home.name}に帰って働く`, `Go back to ${home.name} to work`), hint: L('家族のそばへ', 'Back near family'), apply: (q: Person) => goHome(q) }] : []),
    ...(p.stats.learn >= 60 ? [{ label: L('大学院に進む', 'Go to grad school'), hint: L('あと2年。専門職への道', 'Two more years. A path to professional work'), apply: (q: Person) => { q.school.grad = 'studying'; q.school.uniYears = 0; log(q, L('大学院に進んだ。', 'Started graduate school.'), 'school'); } }] : []),
  ];
  decide(p, {
    title: L('卒業のあと', 'After graduation'),
    text: abroad ? L(`${abroad.name}で学位をとった。どこで、何をする？`, `A degree from ${abroad.name}. Where now, and doing what?`) : L('学位をとった。次は？', 'Degree in hand. What next?'),
    stat: abroad ? L('留学生が卒業後もその国に残って働く割合は、国やビザ制度によって2〜6割ほど (OECD 2022)', 'Between 20% and 60% of international students stay on to work after graduating, depending on the country and its visa rules (OECD 2022)') : undefined,
    options: opts,
    auto: (q) => (q.stats.learn >= 75 && opts.length === 3 && q.rng() < 0.3 ? 2 : abroad && q.rng() < 0.45 ? 1 : 0),
  });
}

function stayOrWork(p: Person): void {
  if (p.school.abroad && p.rng() < 0.35) {
    log(p, L('就労ビザが下りず、帰国することになった。', 'The work visa was denied. Had to go home.'), 'hard');
    goHome(p);
    return;
  }
  if (p.school.abroad) { p.migratedTo = p.school.abroad; p.city = null; }
  startWork(p);
}

function goHome(p: Person): void {
  p.country = p.birthCountry;
  p.migratedTo = undefined;
  log(p, L(`${byCode(p.birthCountry).name}に帰った。`, `Went back to ${byCode(p.birthCountry).name}.`), 'move');
  startWork(p);
}

function gradSchool(p: Person): void {
  p.school.uniYears++;
  bump(p, { learn: 5 });
  if (p.school.uniYears < 2) return;
  p.school.grad = 'done';
  log(p, L('大学院を修了し、修士号をとった。', 'Finished graduate school with a master\'s degree.'), 'school', true);
  if (p.school.abroad && p.country !== p.birthCountry) {
    const abroad = byCode(p.school.abroad);
    decide(p, {
      title: L('修了のあと', 'After the degree'),
      text: L(`${abroad.name}で大学院を終えた。どこで働く？`, `Finished graduate school in ${abroad.name}. Where to work?`),
      options: [
        { label: L(`${abroad.name}に残る`, `Stay in ${abroad.name}`), hint: L('就労ビザが要る', 'Needs a work visa'), apply: (q) => stayOrWork(q) },
        { label: L(`${byCode(p.birthCountry).name}に帰る`, `Go back to ${byCode(p.birthCountry).name}`), apply: (q) => goHome(q) },
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
      log(p, L('兵役を終えて除隊した。', 'Finished military service and was discharged.'), 'work');
      if (!p.working && !p.school.enrolled && p.school.uni !== 'studying') startWork(p);
    }
    return;
  }
  const due = (p.military === 'none' && p.age === 19) || (p.military === 'deferred' && p.age === 24 && p.school.uni !== 'studying');
  if (!due || p.country !== p.birthCountry) return;
  const student = p.school.uni === 'studying' || p.school.grad === 'studying';
  decide(p, {
    title: L('入営の通知', 'Draft notice'),
    text: L(`${byCode(p.birthCountry).name}では男性に兵役の義務がある。期間はおよそ${months}か月。`, `Military service is compulsory for men in ${byCode(p.birthCountry).name}. It lasts about ${months} months.`),
    options: [
      {
        label: L('入隊する', 'Enlist'), hint: L(`${months}か月`, `${months} months`),
        apply: (q) => {
          q.military = 'serving';
          q.serviceEnd = q.age + Math.ceil(months / 12);
          q.working = false;
          log(q, L('入隊した。', 'Entered the military.'), 'work', true);
          bump(q, { health: 2, bond: -3 });
        },
      },
      ...(student && p.military === 'none' ? [{ label: L('入隊を延ばす', 'Defer'), hint: L('学業を理由に', 'On grounds of study'), apply: (q: Person) => { q.military = 'deferred'; } }] : []),
    ],
    auto: (q) => (student && q.rng() < 0.6 && p.military === 'none' ? 1 : 0),
  });
}
