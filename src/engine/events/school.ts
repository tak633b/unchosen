// 学校・大学・留学・兵役。
import { COUNTRIES, byCode, countriesAt, type Country } from '../countries';
import { earnings, formatMoney } from '../economy';
import { L, isEn } from '../../i18n';
import { ARTS_MAJORS, MAJORS, majorName } from '../jobs';
import { destinations, isFree, speaks, stayOdds, thirdCountry, tuitionAbroad } from '../abroad';
import { subsistence } from './common';
import { talent, type Talent } from '../talent';
import { commission, enterAcademy } from './career';
import { bump, countryOf, decide, log, yearOf, type Person } from '../person';
import { uniK, visaRefused } from '../history';
import { clamp } from '../rng';
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

// 芸術高校の科。音楽・美術・踊りのどれかに、はっきり抜けた向きがあり、町に住み、家に少し余裕があるときだけ
// (芸術系の高校に通うのは同世代の数%: 韓国の芸術高校は高校生の1%前後、教育部)
const ARTS_TALENT: Record<'music' | 'art' | 'dance', (p: Person) => number> = {
  music: (p) => talent(p, 'music'), art: (p) => talent(p, 'art'), dance: (p) => (talent(p, 'body') + talent(p, 'music')) / 2,
};
function artsDept(p: Person, c: Country): 'music' | 'art' | 'dance' | undefined {
  if (p.rural || c.gdp < 8000 || p.familyP < 0.3) return undefined;
  const best = (['music', 'art', 'dance'] as const).reduce((a, b) => (ARTS_TALENT[b](p) > ARTS_TALENT[a](p) ? b : a));
  return ARTS_TALENT[best](p) >= 2 ? best : undefined;
}
const DEPT: Record<'music' | 'art' | 'dance', [string, string]> = { music: ['音楽科', 'music'], art: ['美術科', 'fine arts'], dance: ['舞踊科', 'dance'] };

// 高校の種類は、その家がふだん選ぶもので決まる (大学に進む人の多い国ほど、豊かな家ほど普通科)。
// 選ぶ場面は出さず、一行だけ残す
function chooseTrack(p: Person, c: Country): void {
  const dept = artsDept(p, c);
  if (dept) {
    p.school.track = 'arts';
    p.school.dept = dept;
    log(p, L(`実技の試験を受けて、芸術高校の${DEPT[dept][0]}に進んだ。`, `Passed the practical exam and entered the ${DEPT[dept][1]} department of an arts high school.`), 'school');
    return;
  }
  if (p.rng() < (c.tertiary > 0.4 ? 0.75 : 0.55) + (p.familyP - 0.5) * 0.3) {
    p.school.track = 'general';
    log(p, L('家族のほかの子と同じように、普通科の高校に進んだ。', 'Like the other children in the family, went on to an academic high school.'), 'school');
  } else {
    p.school.track = 'vocational';
    bump(p, { learn: 2 });
    log(p, L('手に職をつけるよう言われ、職業科の高校に進んだ。', 'Told to learn a trade, went on to a vocational high school.'), 'school');
  }
}

// ---- 高校のあと ----------------------------------------------------------

export const uniChance = (p: Person, c: Country) =>
  clamp(Math.min(1, c.tertiary) * (0.5 + p.familyP) * (0.4 + p.stats.learn / 100 + talent(p, 'study') * 0.04) * (p.school.track === 'vocational' ? 0.6 : 1), 0.02, 0.95) * uniK(p); // uniK: 歴史で大学が閉ざされた年 (history.ts)

const tuitionOf = (c: Country) => earnings(c, 0.5) * 0.25;

// 士官学校: 体と学力がそろった人だけ。女性の入学は1970〜90年代から (米国の士官学校1976年・防衛大学校1992年・韓国陸軍士官学校1998年)
const canAcademy = (p: Person) => p.stats.learn >= 55 && p.stats.health >= 65 && (p.sex === 'M' || yearOf(p) >= 1995);

function afterHighSchool(p: Person, c: Country): void {
  const chance = uniChance(p, c);
  // 留学できるのは、学費を出せる家か、難民として奨学金を受けられる子
  const canAbroad = (p.familyP > 0.7 && c.gdp < 40000) || (!!p.refugee && p.stats.learn >= 60);
  const academy = canAcademy(p);
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
      ...(canAbroad ? [{
        label: L('外国の大学に留学する', 'Study abroad'), hint: p.refugee ? L('奨学金で', 'On a scholarship') : L('お金はかかるが、道も広がる', 'Costly, but opens doors'),
        apply: (q: Person) => chooseAbroad(q, c),
      }] : []),
      ...(academy ? [{
        label: L('士官学校に進む', 'Military academy'), hint: L('学費はかからない・卒業後は将校', 'No tuition, an officer after graduating'),
        apply: (q: Person) => enterAcademy(q),
      }] : []),
    ],
    auto: (q) => (canAbroad && q.rng() < 0.15 ? 2 : academy && q.rng() < 0.02 ? (canAbroad ? 3 : 2) : q.rng() < chance * 1.1 ? 0 : 1),
  });
}

// 学生ビザが下りなければ (history.ts の visaRefused: 米国2025年〜・カナダ2024年〜)、国内の大学を受ける
function studyIn(p: Person, home: Country, d: Country): void {
  if (!visaRefused(p, d.code)) { enterUni(p, home, d); return; }
  log(p, L(`${d.name}の学生ビザが下りなかった。国内の大学を受けることにした。`, `The student visa for ${d.name} was refused. Applied to a university at home instead.`), 'school');
  if (p.rng() < uniChance(p, home)) enterUni(p, home, null); else startWork(p);
}

// 行き先は、この国の学生が実際によく行く3か国から選ぶ
function chooseAbroad(p: Person, home: Country): void {
  const dests = destinations(p, yearOf(p));
  if (!dests.length) { enterUni(p, home, null); return; }
  const living = (d: Country) => subsistence(d) * 2;
  decide(p, {
    title: L('どこに留学する？', 'Where to study?'),
    text: L(`${home.name}から留学する学生がよく行く国。学費・暮らし・言葉・卒業後に残れる見込みがそれぞれ違う。`, `The countries students from ${home.name} most often go to. Each differs in cost, language and the odds of staying on to work.`),
    stat: L('行き先はユネスコ統計研究所の留学生の受け入れ国の目安。卒業後5年たっても留学先に残っている人は国により2〜6割 (OECD 2022)', 'Destinations follow UNESCO Institute for Statistics data on where students go. Five years after graduating, 20 to 60% are still in the host country (OECD 2022)'),
    options: dests.map((d) => {
      const free = isFree(d);
      const lang = speaks(p, d);
      return {
        label: d.name,
        hint: [
          free ? L('授業料なし', 'No tuition') : L(`年の学費${formatMoney(tuitionAbroad(d))}`, `Tuition ${formatMoney(tuitionAbroad(d))}/yr`),
          L(`暮らし年${formatMoney(living(d))}`, `living ${formatMoney(living(d))}/yr`),
          lang ? '' : L('言葉の1年が要る', 'needs a language year'),
          L(`残れる見込み${Math.round(stayOdds(d) * 100)}%`, `${Math.round(stayOdds(d) * 100)}% stay to work`),
        ].filter(Boolean).join(L('・', ', ')),
        apply: (q: Person) => studyIn(q, home, d),
      };
    }),
    // 自動では、安くて言葉の通じる国を選びやすい
    auto: (q) => {
      const w = dests.map((d) => (speaks(q, d) ? 2 : 1) * (isFree(d) || tuitionAbroad(d) < 10000 ? 1.5 : 1));
      let x = q.rng() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return i;
      return 0;
    },
  });
}

function enterUni(p: Person, home: Country, abroad: Country | null): void {
  p.school.uni = 'studying';
  p.school.uniYears = 0;
  if (abroad) {
    // 言葉が通じなければ、まず1年その国の言葉を学ぶ
    p.school.langYear = !speaks(p, abroad);
    const years = 4 + (p.school.langYear ? 1 : 0);
    const tuition = tuitionAbroad(abroad) * years;
    const living = subsistence(abroad) * 2 * years;
    // 難民の家の子は奨学金で学費が無く、暮らしも半分まかなわれる (UNHCR の DAFI 奨学金など)
    const cost = p.refugee ? living * 0.5 : tuition + living;
    const parents = p.refugee ? 0 : cost * clamp(p.familyP * 0.9, 0, 0.9);
    p.wealth -= cost - parents;
    p.school.abroad = abroad.code;
    p.country = abroad.code;
    p.city = null;
    if (!p.countriesLived.includes(abroad.code)) p.countriesLived.push(abroad.code);
    const note = p.refugee ? L('奨学金で学費は免除された。', 'A scholarship covered the tuition.') : isFree(abroad) ? L('授業料はかからず、費用は暮らしの分だけ。', 'There was no tuition; the cost was living expenses only.') : '';
    log(p, L(`${abroad.name}の大学に合格し、留学した。${note}費用 ${formatMoney(cost)} のうち ${formatMoney(parents)} は親が出し、残りは借金になった。${p.school.langYear ? 'はじめの1年は言葉の学校に通う。' : ''}`,
      `Was admitted to a university in ${abroad.name} and moved there. ${note ? `${note} ` : ''}Of the ${formatMoney(cost)} cost, parents paid ${formatMoney(parents)}; the rest became debt.${p.school.langYear ? ' The first year would be spent in language school.' : ''}`), 'move', true);
  } else {
    const cost = tuitionOf(home) * 4;
    const parents = cost * clamp(p.familyP * 0.9, 0, 0.9);
    p.wealth -= cost - parents;
    log(p, isEn
      ? `Got into university. Tuition for four years: ${formatMoney(cost)}.${cost - parents > 1 ? ` ${formatMoney(cost - parents)} of it to be covered by scholarships and loans.` : ''}`
      : `大学に合格した。学費は4年で ${formatMoney(cost)}。${cost - parents > 1 ? `うち ${formatMoney(cost - parents)} は奨学金と借金でまかなう。` : ''}`, 'school', true);
  }
  bump(p, { happy: 8 });
  chooseMajor(p);
}

// 芸術の専攻は実技の試験で入る。向きがはっきりあるか、芸術高校を出た人にだけ候補に出る
const MAJOR_TALENT: Record<string, Talent> = { 音楽: 'music', 美術: 'art', 舞踊: 'body' };
const ARTS_DEPT: Record<string, string> = { 音楽: 'music', 美術: 'art', 舞踊: 'dance' };
const artsOpen = (p: Person, m: string) => !ARTS_MAJORS.includes(m) || p.school.dept === ARTS_DEPT[m] || talent(p, MAJOR_TALENT[m]) >= 0.8;
// 合格の見込み: 芸術系の実技入試の倍率は数倍〜十倍 (韓国の音大・美大の実技入試など)。向きと芸術高校で上がる
export const auditionOdds = (p: Person, m: string) => clamp(0.25 + talent(p, MAJOR_TALENT[m]) * 0.15 + (p.school.dept === ARTS_DEPT[m] ? 0.2 : 0), 0.05, 0.85);

function audition(p: Person, m: string): void {
  if (p.rng() < auditionOdds(p, m)) {
    p.school.major = m;
    log(p, L(`実技の試験に受かり、${m}を専攻することになった。`, `Passed the audition and was accepted to study ${majorName(m)}.`), 'school', true);
    bump(p, { happy: 5 });
  } else {
    p.school.major = '人文学';
    log(p, L(`${m}の実技の試験には受からず、人文学を学ぶことにした。`, `Did not pass the ${majorName(m).toLowerCase()} audition, and studied the humanities instead.`), 'school');
    bump(p, { happy: -4 });
  }
}

function chooseMajor(p: Person): void {
  const med = p.stats.learn >= 80;
  // 情報科学の学科は1960年代半ばから
  const list = MAJORS.filter((m) => (m !== '医学' || med) && (m !== '情報科学' || yearOf(p) >= 1965) && artsOpen(p, m));
  const shown = [...list].sort(() => p.rng() - 0.5).slice(0, 5);
  decide(p, {
    title: L('何を学ぶ？', 'What to study?'),
    text: isEn
      ? `Time to choose a major. It will shape the first job.${med ? '' : ' Grades fell just short of the bar for medicine.'}`
      : `専攻を決める時期になった。専攻は最初の仕事を大きく左右する。${med ? '' : '医学部の合格ラインには少し届かなかった。'}`,
    options: shown.map((m) => ({
      label: majorName(m),
      hint: ARTS_MAJORS.includes(m) ? L(`実技の試験・合格の見込み${Math.round(auditionOdds(p, m) * 100)}%`, `Audition, ${Math.round(auditionOdds(p, m) * 100)}% chance`) : undefined,
      apply: (q: Person) => { if (ARTS_MAJORS.includes(m)) { audition(q, m); return; } q.school.major = m; log(q, L(`${m}を専攻することにした。`, `Chose to major in ${majorName(m)}.`), 'school'); },
    })),
    auto: (q) => Math.floor(q.rng() * shown.length),
  });
}

function university(p: Person): void {
  p.school.uniYears++;
  bump(p, { learn: 5 + (p.focus === 'learn' ? 3 : 0) });
  const years = (p.school.major === '医学' ? 6 : 4) + (p.school.langYear ? 1 : 0);
  if (p.school.langYear && p.school.uniYears === 1) log(p, L(`${countryOf(p).name}の言葉を1年学び、授業についていけるようになった。`, `Spent a year learning the language of ${countryOf(p).name}, enough to follow lectures.`), 'school');
  if (p.school.uniYears < years) return;
  p.school.uni = 'done';
  if (p.school.major === '防衛学') { commission(p); return; }
  log(p, L(`大学を卒業した(${p.school.major ?? '学士'})。`, `Graduated from university (${p.school.major ? majorName(p.school.major) : 'bachelor\'s'}).`), 'school', true);
  afterUni(p);
}

function afterUni(p: Person): void {
  const abroad = p.school.abroad ? byCode(p.school.abroad) : null;
  const home = byCode(p.birthCountry);
  // まれに、学んだ国でも故郷でもない第三国で仕事を探す道がひらける
  const third = abroad && p.rng() < 0.08 ? thirdCountry(p, yearOf(p)) : null;
  const opts = [
    { label: abroad ? L(`${abroad.name}に残って仕事を探す`, `Stay in ${abroad.name} and look for work`) : L('仕事を探す', 'Look for work'), hint: abroad ? L('就労ビザが要る', 'Needs a work visa') : undefined, apply: (q: Person) => stayOrWork(q) },
    ...(abroad ? [{ label: L(`${home.name}に帰って働く`, `Go back to ${home.name} to work`), hint: L('家族のそばへ', 'Back near family'), apply: (q: Person) => goHome(q) }] : []),
    ...(third ? [{ label: L(`${third.name}で仕事を探す`, `Look for work in ${third.name}`), hint: L('知り合いはいない・ビザは狭き門', 'No one there, and visas are hard'), apply: (q: Person) => goThird(q, third) }] : []),
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
  if (p.school.abroad && p.rng() >= stayOdds(byCode(p.school.abroad))) {
    log(p, L('就労ビザが下りず、帰国することになった。', 'The work visa was denied. Had to go home.'), 'hard');
    goHome(p);
    return;
  }
  if (p.school.abroad) { p.migratedTo = p.school.abroad; p.city = null; }
  startWork(p);
}

// 第三国: 就労の在留資格がとれる見込みは低い
function goThird(p: Person, d: Country): void {
  if (p.rng() < 0.3) {
    p.country = d.code;
    p.migratedTo = d.code;
    p.city = null;
    if (!p.countriesLived.includes(d.code)) p.countriesLived.push(d.code);
    log(p, L(`${d.name}で仕事が見つかり、移り住んだ。`, `Found work in ${d.name} and moved there.`), 'move', true);
    startWork(p);
    return;
  }
  log(p, L(`${d.name}での仕事は見つからなかった。`, `Found no work in ${d.name}.`), 'hard');
  goHome(p);
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
