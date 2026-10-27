// 恋愛・結婚・子ども。相手には名前と仕事がある。
import { causeName } from '../causes';
import { makeName, withFamily } from '../identity';
import type { Country } from '../countries';
import { L, isEn } from '../../i18n';
import { JOBS, jobName } from '../jobs';
import { bump, childWord, countryOf, decide, eduLevel, log, yearOf, type Person, type Relative } from '../person';
import { awayAtWar } from '../worldevents';
import type { Sex } from '../lifetable';
import { clamp, normal, pick } from '../rng';
import { yearly } from './common';
import { freshName, mourn, newId, shared } from '../bonds';
import { breakUp, keepLateSpouse } from './bonds';
import { because, birthWhy, childMarriageWhy } from '../why';
import { spouseSavings } from './household';

const TRAITS = isEn
  ? ['kind', 'cheerful', 'quiet', 'earnest', 'quick to laugh', 'dependable', 'strong-willed', 'easygoing']
  : ['やさしい', '明るい', '物静かな', 'まじめな', 'よく笑う', '頼りになる', '気の強い', 'のんびりした'];

export function newPartner(p: Person): Relative {
  const sex: Sex = p.sex === 'F' ? 'M' : 'F';
  const d = p.sex === 'F' ? normal(p.rng, 3, 3) : normal(p.rng, -3, 3);
  const age = Math.max(17, Math.round(p.age + d));
  const n = freshName(() => makeName(p.rng, p.country, sex, undefined, undefined, yearOf(p) - age), (p.nameKeys ??= []));
  const name = n.full;
  const edu = clamp(eduLevel(p) + Math.round(normal(p.rng, 0, 1)), 0, 5);
  const jobs = JOBS.filter((j) => j.edu <= edu && (j.maxEdu ?? 5) >= edu && !j.majors);
  return { alive: true, age, sex, name, job: jobs.length ? pick(p.rng, jobs).name : '家の仕事', id: newId(p), bond: 55, since: p.age, country: p.country, fam: [n.pool, n.familyIndex] };
}

// ---- 結婚せずに一緒に暮らす ----
// 新しく一緒に暮らし始める二人のうち、結婚せずに暮らし始める割合の目安 (2010年代)。
// 欧米: OECD Family Database SF3.3 (20〜34歳でパートナーと暮らす人のうち同棲の割合) を、のちに結婚する人のぶん高めに置いた。
// 中南米: Esteve, Lesthaeghe & López-Gay (2012, Population and Development Review) の、25〜29歳で連れ合いのいる女性のうち事実婚の割合。
// 東アジア: 同棲はまれで、子ができると婚姻届を出す (日本の出生動向基本調査で、同棲中の未婚者は2〜3%)
const COHAB: Record<string, number> = {
  SWE: 0.7, NOR: 0.7, DNK: 0.65, FIN: 0.65, FRA: 0.65, EST: 0.6, BEL: 0.55, NLD: 0.55, GBR: 0.55, DEU: 0.45, AUT: 0.45, CHE: 0.4,
  ESP: 0.45, PRT: 0.4, ITA: 0.35, CZE: 0.45, HUN: 0.45, BGR: 0.5, SVN: 0.55, LVA: 0.5, LTU: 0.35, POL: 0.2, GRC: 0.12, ROU: 0.25,
  RUS: 0.35, UKR: 0.3, BLR: 0.3, IRL: 0.4, USA: 0.45, CAN: 0.5, AUS: 0.45, NZL: 0.5,
  COL: 0.75, PER: 0.7, DOM: 0.75, PAN: 0.75, BRA: 0.55, ARG: 0.55, CHL: 0.5, MEX: 0.35, ECU: 0.55, BOL: 0.5, PRY: 0.55, URY: 0.6,
  GTM: 0.5, HND: 0.6, NIC: 0.6, SLV: 0.55, CRI: 0.5, HTI: 0.6, JAM: 0.6, TTO: 0.4, ZAF: 0.25,
  JPN: 0.04, KOR: 0.03, CHN: 0.05,
};
const COHAB_REGION: Record<string, number> = { ヨーロッパ: 0.3, 南アメリカ: 0.55, 北アメリカ: 0.5, オセアニア: 0.3, アフリカ: 0.1, アジア: 0.02 };
const LATIN = new Set(['南アメリカ', '北アメリカ']);
// 欧米で同棲が広がったのは1970年代から (英国で、結婚前に同棲した夫婦は1960年代後半に約5%、1990年代に約7割。ONS)。
// 中南米の事実婚は昔から多く、1970年代から増えた。アジア・アフリカは時代で変えない
export function cohabShare(c: Country): number {
  const y = c.year ?? 2020;
  const base = COHAB[c.code] ?? COHAB_REGION[c.region] ?? 0.05;
  const latin = LATIN.has(c.region) && !['USA', 'CAN'].includes(c.code);
  const k = latin ? clamp(0.35 + (0.65 * (y - 1970)) / 35, 0.35, 1)
    : c.region === 'アジア' || c.region === 'アフリカ' ? 1 : clamp((y - 1965) / 40, 0.02, 1);
  return base * k;
}
// 子ができると籍を入れる国 (東アジアなど、結婚の外で生まれる子が数%の国)
const registerForChild = (c: Country) => c.region === 'アジア' || c.region === 'アフリカ';

function moveIn(p: Person, partner: Relative): void {
  keepLateSpouse(p);
  p.spouse = { ...partner, cohab: true };
  p.dating = undefined;
  shared(p, [p.spouse], L(`${partner.name}と一緒に暮らし始めた。結婚はしていない。`, `Moved in with ${partner.name}, without marrying.`), 'love', 8, true, undefined, 'move_in');
  bump(p, { happy: 8, bond: 12 });
  spouseSavings(p);
}

// 一緒に暮らしてきた相手と籍を入れる
function wed(p: Person, why = ''): void {
  const s = p.spouse!;
  s.cohab = false;
  shared(p, [s], L(`${why}${s.name}と正式に結婚した。`, why ? `${why} married ${s.name}.` : `Married ${s.name}.`), 'love', 6, true, undefined, 'wedding');
  bump(p, { happy: 5 });
  surname(p);
}

// ---- 結婚で姓を変えるか ----
// 妻が夫の姓になる割合: 米国79% (Pew Research Center 2023)、英国約85% (目安)、ドイツ約74% (GfdS 2018 前後の目安)、
// ポーランド・ロシア約8割 (目安)、ブラジル約6割 (2010年代の登記の目安。1977年までは法律で夫の姓)、オーストラリア約75% (目安)。
// トルコは民法で妻が夫の姓になる (旧姓を前に添えられる)。日本は夫婦で一つの姓 (民法750条)、夫の姓が約95% (人口動態統計特殊報告 2016)。
// 1980年より前は、どの国でもほぼ全員が夫の姓 (日本・トルコを除いて97%とした)
const TAKE: Record<string, number> = { USA: 0.79, GBR: 0.85, DEU: 0.74, POL: 0.8, RUS: 0.8, TUR: 1, BRA: 0.6, AUS: 0.75, JPN: 0.95 };
function takeShare(c: Country): number | undefined {
  const t = TAKE[c.code];
  if (t === undefined) return undefined;
  if (c.code === 'JPN' || c.code === 'TUR') return t;
  return (c.year ?? 2020) < (c.code === 'BRA' ? 1977 : 1980) ? 0.97 : t;
}
function rename(p: Person, [pool, fam]: [string, number], line: [string, string]): void {
  const name = withFamily(pool, p.sex, p.given, fam);
  if (name === p.name) { log(p, L('二人は、もともと同じ姓だった。', 'The two already shared a surname.'), 'love'); return; }
  p.maiden ??= p.name;
  p.name = name;
  // これから生まれる子もこの姓 (giveBirth)。命名の伝統が違う相手なら、子の姓の番号は変えない (伝統ごとに姓の一覧が違う)
  // ponytail: 伝統の違う夫の姓を名のっても、子は自分の側の伝統の名と姓で生まれる
  if (pool === p.pool) p.familyIndex = fam;
  log(p, L(line[0].replace('{n}', p.name), line[1].replace('{n}', p.name)), 'love');
}
export function surname(p: Person): void {
  const s = p.spouse;
  const c = countryOf(p);
  const share = takeShare(c);
  if (!s || s.fam === undefined || share === undefined || p.anchor) return;
  if (c.code === 'JPN') {
    decide(p, {
      title: L('どちらの姓にする', 'Whose surname'),
      text: L(`日本では、結婚する二人は一つの姓を名のる。${s.name}と話して決める。`, `In Japan a married couple must share one surname. Time to decide with ${s.name}.`),
      stat: L('夫の姓を選ぶ夫婦が約95% (厚生労働省 人口動態統計特殊報告 2016)', 'About 95% of couples choose the husband’s name (MHLW 2016)'),
      options: [
        { label: L('夫の姓にする', 'Take the husband’s name'), apply: (q) => { if (q.sex === 'F') rename(q, s.fam!, ['夫の姓になり、{n}になった。', 'Took the husband’s name: now {n}.']); } },
        { label: L('妻の姓にする', 'Take the wife’s name'), apply: (q) => { if (q.sex === 'M') rename(q, s.fam!, ['妻の姓になり、{n}になった。', 'Took the wife’s name: now {n}.']); } },
      ],
      auto: (q) => (q.rng() < share ? 0 : 1),
    });
    return;
  }
  if (p.sex !== 'F' || s.sex !== 'M') return;
  if (share >= 1) { rename(p, s.fam, ['法律にしたがって夫の姓になり、{n}になった。', 'By law, took the husband’s name: now {n}.']); return; }
  decide(p, {
    title: L('結婚後の姓', 'Surname after marriage'),
    text: L(`${s.name}の姓にするか、自分の姓のままでいるか。`, `Take ${s.name}'s surname, or keep your own?`),
    options: [
      { label: L('夫の姓にする', 'Take his name'), apply: (q) => rename(q, s.fam!, ['夫の姓になり、{n}になった。', 'Took the husband’s name: now {n}.']) },
      { label: L('自分の姓のままでいる', 'Keep my own'), apply: (q) => log(q, L('結婚しても、自分の姓のままでいることにした。', 'Kept her own surname after marrying.'), 'love') },
    ],
    auto: (q) => (q.rng() < share ? 0 : 1),
  });
}

export function marry(p: Person, partner: Relative): void {
  keepLateSpouse(p);
  p.spouse = { ...partner };
  p.dating = undefined;
  shared(p, [p.spouse], L(`${partner.name}と結婚した。`, `Married ${partner.name}.`), 'love', 10, true, undefined, 'wedding');
  bump(p, { happy: 10, bond: 15 });
  spouseSavings(p);
  surname(p);
}

export function love(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  // 一緒に暮らす相手と、いつか籍を入れる (欧米で同棲の約半数が5年以内に結婚。中南米の事実婚は長く続く)
  if (p.spouse?.alive && p.spouse.cohab) {
    if (r() < (LATIN.has(c.region) && !['USA', 'CAN'].includes(c.code) ? 0.03 : 0.1)) {
      const s = p.spouse;
      decide(p, {
        title: L('結婚の話', 'Talk of marriage'),
        text: L(`${s.name}と一緒に暮らして${p.age - (s.since ?? p.age)}年。籍を入れようかと話している。`, `${p.age - (s.since ?? p.age)} years living with ${s.name}. The two are talking about getting married.`),
        options: [
          { label: L('結婚する', 'Marry'), apply: (q) => { if (q.spouse === s && s.alive) wed(q); } },
          { label: L('このままでいい', 'Keep as is'), apply: () => {} },
        ],
        auto: (q) => (q.rng() < 0.7 ? 0 : 1),
      });
    }
    return;
  }
  if (p.spouse?.alive || p.school.enrolled) return;
  // 戦争で召集されているあいだ (前線・捕虜) は出会いも結婚も無い。serviceEnd 999 は戦時の召集 (worldevents.ts)
  if (p.military === 'serving' && p.serviceEnd === 999) return;
  const co = cohabShare(c);
  if (p.dating) {
    p.dating.age++;
    p.dating.years++;
    if (r() < 0.22) {
      breakUp(p, p.dating, L(`${p.dating.name}と別れた。`, `Broke up with ${p.dating.name}.`));
      bump(p, { happy: -6 });
    } else if (p.dating.years >= 2 && r() < 0.35) {
      const d = p.dating;
      decide(p, {
        title: L('結婚の話', 'Talk of marriage'),
        text: L(`${d.name}と付き合って${d.years}年。そろそろ一緒になろうかと話している。`, `${d.years} years with ${d.name}. The two have started talking about marriage.`),
        options: [
          { label: L('結婚する', 'Marry'), apply: (q) => marry(q, d) },
          { label: L('このままでいい', 'Keep as is'), apply: () => {} },
          { label: L('別れる', 'Break up'), apply: (q) => { if (q.dating === d) breakUp(q, d, L(`${d.name}と別れた。`, `Broke up with ${d.name}.`)); } },
          ...(co >= 0.05 ? [{ label: L('結婚せずに一緒に暮らす', 'Move in without marrying'), apply: (q: Person) => moveIn(q, d) }] : []),
        ],
        auto: (q) => (q.rng() < 0.7 ? (co >= 0.05 && q.rng() < co ? 3 : 0) : 1),
      });
    }
    return;
  }
  const minAge = c.childMarriage > 0.2 ? 17 : 19;
  if (p.age < minAge || p.age > 60) return;
  const base = p.age < 35 ? 0.13 : p.age < 45 ? 0.07 : 0.03;
  if (r() >= base * (p.focus === 'family' ? 1.5 : 1)) return;
  const partner = newPartner(p);
  decide(p, {
    title: p.spouse ? L('もう一度', 'Again') : L('好きな人ができた', 'Someone special'),
    text: isEn
      ? `${partner.name}, an acquaintance: a ${pick(r, TRAITS)} ${partner.sex === 'F' ? 'woman' : 'man'} of ${partner.age}. Works as: ${jobName(partner.job ?? '')}.`
      : `知り合いの${partner.age}歳の${pick(r, TRAITS)}${partner.sex === 'F' ? '女性' : '男性'}、${partner.name}。仕事は${partner.job}。`,
    options: [
      { label: L('結婚する', 'Marry'), hint: L('つながり↑ 幸福↑', 'Bond↑ Happiness↑'), apply: (q) => marry(q, partner) },
      ...(co >= 0.05 ? [{ label: L('結婚せずに一緒に暮らす', 'Move in without marrying'), apply: (q: Person) => moveIn(q, partner) }] : []),
      {
        label: L('付き合う', 'Date'), hint: L('決めるのは先送り', 'Decide later'),
        apply: (q) => { q.dating = { ...partner, years: 0 }; shared(q, [q.dating], L(`${partner.name}と付き合い始めた。`, `Started seeing ${partner.name}.`), 'love', 5, false, undefined, 'dating'); bump(q, { happy: 6 }); },
      },
      { label: L('断る', 'Decline'), apply: () => {} },
    ],
    // 一緒になると決めたうち、その国・時代の割合で結婚せずに暮らし始める (cohabShare)
    auto: (q) => {
      const k = co >= 0.05 ? 1 : 0;
      if (q.rng() < (c.gdp < 10000 ? 0.65 : 0.35)) return k && q.rng() < co ? 1 : 0;
      return q.rng() < 0.8 ? 1 + k : 2 + k;
    },
  });
}

export function childMarriage(p: Person): void {
  const c = countryOf(p);
  if (p.sex !== 'F' || p.age < 12 || p.age > 17 || p.spouse) return;
  // 貧しい家・農村ほど早く結婚させられる。平均がほぼ1倍になるよう 0.85 をかける (実測で調整)
  const mult = 0.85 * (p.familyP < 0.4 ? 1.5 : p.familyP > 0.7 ? 0.3 : 1) * (p.rural ? 1.2 : 1);
  if (p.rng() >= yearly(c.childMarriage * mult, 6)) return;
  const partner = newPartner(p);
  partner.age = p.age + Math.round(clamp(normal(p.rng, 9, 4), 2, 30));
  partner.bond = 25;
  p.spouse = partner;
  p.childMarriage = true;
  const wasInSchool = p.school.enrolled;
  p.school.enrolled = false;
  log(p, isEn
    ? `At ${p.age}, was married off to ${partner.name}, ${partner.age}, chosen by her parents.${wasInSchool ? ' Never went back to school.' : ''}`
    : `${p.age}歳で、親の決めた${partner.age}歳の${partner.name}と結婚させられた。${wasInSchool ? '学校には戻れなかった。' : ''}`, 'hard', true,
    L(`${c.name}では女性のおよそ${Math.round(c.childMarriage * 100)}%が18歳になる前に結婚している (UNICEF)`, `In ${c.name}, about ${Math.round(c.childMarriage * 100)}% of women marry before 18 (UNICEF)`), [partner.id!]);
  because(p, childMarriageWhy(p, c));
  bump(p, { happy: -15, health: -3 });
  surname(p);
  // 農村では嫁ぎ先の畑で働く。町では家事を担い、外で働くかは後で決まる
  if (!p.working && p.age >= 12 && !p.city) {
    p.working = true;
    p.job = '家事と畑仕事';
    p.jobKind = 'farm';
    p.selfEmployed = true;
    p.incomeP = clamp(p.familyP * 0.6, 0.01, 0.5);
  }
}

export function births(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (!p.spouse?.alive) { delete p.recent.trying; return; }
  const motherAge = p.sex === 'F' ? p.age : p.spouse.age;
  if (awayAtWar(p)) return; // 夫婦が戦争で離れているあいだ
  if (p.recent.trying !== undefined) { tryForChild(p); return; }
  if (p.recent.noMoreKids !== undefined) return;
  if (motherAge < 15 || motherAge > 45) return;
  // 次の子までは2年以上あく。合計特殊出生率に合うよう、残りの年の確率を上げてある (実測で調整)
  if (p.children.some((k) => k.alive && k.age < 2)) return;
  // 少子の国は「持つ」を選んでも授からない年がある (tryForChild) ので、その分だけ考える年を増やして出生率に合わせる (実測: 子の数が約12%減っていた)
  const pYear = Math.min(0.6, c.tfr < 3 ? (c.tfr / 11) * 1.14 : c.tfr / 19);
  if (r() >= pYear) return;
  if (c.tfr < 3) {
    decide(p, {
      title: L('子ども', 'Children'),
      text: p.children.length ? L('もう一人、子どもを持つ？', 'Have another child?') : L('子どもを持つ？', 'Have a child?'),
      options: [
        { label: L('持つ', 'Yes'), apply: (q) => tryForChild(q) },
        { label: L('今は持たない', 'Not now'), apply: () => {} },
      ],
      // 少子の国では、2人目・3人目からは持たない人が増える
      auto: (q) => (q.rng() < (q.children.length < 2 ? 0.85 : q.children.length < 3 ? 0.4 : 0.2) ? 0 : 1),
    });
  } else {
    giveBirth(p);
  }
}

// 望んでも、その年に授かるとは限らない。授からなければ次の年も待ち、3年待っても授からなければあきらめる
// 1年以内に妊娠する見込み: 35歳未満で約85%、35〜39歳で約60%、40歳を過ぎると約35% (米国産科婦人科学会)
const conceiveP = (motherAge: number) => (motherAge < 35 ? 0.85 : motherAge < 40 ? 0.6 : 0.35);
function tryForChild(p: Person): void {
  const motherAge = p.sex === 'F' ? p.age : p.spouse!.age;
  const since = p.recent.trying;
  if (motherAge <= 45 && p.rng() < conceiveP(motherAge)) {
    delete p.recent.trying;
    if (since !== undefined) log(p, L('1年以上待った末に、子どもを授かった。', 'After more than a year of waiting, a child was on the way.'), 'family');
    giveBirth(p);
    return;
  }
  if (since !== undefined && (p.age - since >= 3 || motherAge >= 45)) {
    delete p.recent.trying;
    p.recent.noMoreKids = p.age;
    log(p, p.children.length
      ? L('もう一人を待ったが、授からなかった。今いる子どもたちと生きていくことにした。', 'Waited for one more, but it did not happen. Decided to build life around the children already here.')
      : L('何年も待ったが、子どもは授からなかった。二人で生きていくことにした。', 'Years of waiting, and no child came. Decided the two of them would make a life together.'), 'family', true);
    bump(p, { happy: -8 });
    return;
  }
  p.recent.trying = since ?? p.age;
  log(p, L('子どもを待ち望んだが、今年は授からなかった。', 'Hoped for a child, but not this year.'), 'family', false,
    L('1年以内に妊娠する見込みは、35歳未満で約85%、35〜39歳で約60%、40歳を過ぎると約35% (米国産科婦人科学会)', 'The chance of pregnancy within a year is about 85% under 35, 60% at 35–39 and 35% after 40 (ACOG)'));
  bump(p, { happy: -3 });
}

export function giveBirth(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.spouse?.cohab && registerForChild(c)) wed(p, L('子どもができたのを機に、', 'With a baby on the way,'));
  const sex: Sex = r() < 0.512 ? 'M' : 'F';
  const name = freshName(() => makeName(r, p.birthCountry, sex, { pool: p.pool, index: p.familyIndex }, undefined, yearOf(p)), (p.nameKeys ??= [])).given;
  const kid = { alive: true, age: 0, sex, name, id: newId(p), bond: 75, since: p.age, country: p.country };
  p.children.push(kid);
  const n = p.children.length;
  shared(p, [kid, p.spouse!], L(`${n}人目の子ども、${childWord(sex)}の${name}が生まれた。`, `${n === 1 ? 'A first child was born' : `Child number ${n} was born`}: a ${sex === 'F' ? 'daughter' : 'son'}, ${name}.`), 'family', n === 1 ? 5 : 2, n === 1, undefined, 'birth');
  bump(p, { happy: 8, bond: 8 });
  const motherAge = p.sex === 'F' ? p.age : p.spouse!.age;
  const risk = (c.mmr / 1e5) * (p.familyP < 0.3 && p.rural ? 1.6 : p.incomeP > 0.7 ? 0.5 : 1) * (motherAge < 18 ? 2 : 1);
  // 輪の人の一生では、亡くなる年は記録で決まっている (kin.ts)
  if (r() < risk && !p.anchor) {
    if (p.sex === 'F') {
      p.alive = false;
      p.cause = causeName('出産時の合併症');
    } else {
      p.spouse!.alive = false;
      log(p, L(`妻の${p.spouse!.name}が出産で亡くなった。`, `His wife, ${p.spouse!.name}, died in childbirth.`), 'loss', true,
        L(`${c.name}では出産10万件あたりおよそ${Math.round(c.mmr)}人の母親が亡くなる (WHO)`, `In ${c.name}, about ${Math.round(c.mmr)} mothers die per 100,000 births (WHO)`), [p.spouse!.id!]);
      because(p, birthWhy(p, c, motherAge));
      mourn(p, p.spouse!, -25, -15);
    }
  }
}
