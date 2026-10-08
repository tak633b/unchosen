// 恋愛・結婚・子ども。相手には名前と仕事がある。
import { causeName } from '../causes';
import { makeName } from '../identity';
import { L, isEn } from '../../i18n';
import { JOBS, jobName } from '../jobs';
import { bump, childWord, countryOf, decide, eduLevel, log, type Person, type Relative } from '../person';
import type { Sex } from '../lifetable';
import { clamp, normal, pick } from '../rng';
import { yearly } from './common';
import { freshName, mourn, newId, shared } from '../bonds';
import { breakUp, keepLateSpouse } from './bonds';
import { because, birthWhy, childMarriageWhy } from '../why';

const TRAITS = isEn
  ? ['kind', 'cheerful', 'quiet', 'earnest', 'quick to laugh', 'dependable', 'strong-willed', 'easygoing']
  : ['やさしい', '明るい', '物静かな', 'まじめな', 'よく笑う', '頼りになる', '気の強い', 'のんびりした'];

function newPartner(p: Person): Relative {
  const sex: Sex = p.sex === 'F' ? 'M' : 'F';
  const d = p.sex === 'F' ? normal(p.rng, 3, 3) : normal(p.rng, -3, 3);
  const age = Math.max(17, Math.round(p.age + d));
  const name = makeName(p.rng, p.country, sex).full;
  const edu = clamp(eduLevel(p) + Math.round(normal(p.rng, 0, 1)), 0, 5);
  const jobs = JOBS.filter((j) => j.edu <= edu && (j.maxEdu ?? 5) >= edu && !j.majors);
  return { alive: true, age, sex, name, job: jobs.length ? pick(p.rng, jobs).name : '家の仕事', id: newId(p), bond: 55, since: p.age };
}

function marry(p: Person, partner: Relative): void {
  keepLateSpouse(p);
  p.spouse = { ...partner };
  p.dating = undefined;
  shared(p, [p.spouse], L(`${partner.name}と結婚した。`, `Married ${partner.name}.`), 'love', 10, true, undefined, 'wedding');
  bump(p, { happy: 10, bond: 15 });
}

export function love(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.spouse?.alive || p.school.enrolled) return;
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
        ],
        auto: (q) => (q.rng() < 0.7 ? 0 : 1),
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
      {
        label: L('付き合う', 'Date'), hint: L('決めるのは先送り', 'Decide later'),
        apply: (q) => { q.dating = { ...partner, years: 0 }; shared(q, [q.dating], L(`${partner.name}と付き合い始めた。`, `Started seeing ${partner.name}.`), 'love', 5, false, undefined, 'dating'); bump(q, { happy: 6 }); },
      },
      { label: L('断る', 'Decline'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < (c.gdp < 10000 ? 0.65 : 0.35) ? 0 : q.rng() < 0.8 ? 1 : 2),
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
  if (!p.spouse?.alive) return;
  const motherAge = p.sex === 'F' ? p.age : p.spouse.age;
  if (motherAge < 15 || motherAge > 45) return;
  // 次の子までは2年以上あく。合計特殊出生率に合うよう、残りの年の確率を上げてある (実測で調整)
  if (p.children.some((k) => k.alive && k.age < 2)) return;
  const pYear = Math.min(0.6, c.tfr / (c.tfr < 3 ? 11 : 19));
  if (r() >= pYear) return;
  if (c.tfr < 3) {
    decide(p, {
      title: L('子ども', 'Children'),
      text: p.children.length ? L('もう一人、子どもを持つ？', 'Have another child?') : L('子どもを持つ？', 'Have a child?'),
      options: [
        { label: L('持つ', 'Yes'), apply: (q) => giveBirth(q) },
        { label: L('今は持たない', 'Not now'), apply: () => {} },
      ],
      // 少子の国では、2人目・3人目からは持たない人が増える
      auto: (q) => (q.rng() < (q.children.length < 2 ? 0.85 : q.children.length < 3 ? 0.4 : 0.2) ? 0 : 1),
    });
  } else {
    giveBirth(p);
  }
}

export function giveBirth(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  const sex: Sex = r() < 0.512 ? 'M' : 'F';
  const name = freshName(() => makeName(r, p.birthCountry, sex, { pool: p.pool, index: p.familyIndex }), (p.nameKeys ??= []));
  const kid = { alive: true, age: 0, sex, name, id: newId(p), bond: 75, since: p.age };
  p.children.push(kid);
  const n = p.children.length;
  shared(p, [kid, p.spouse!], L(`${n}人目の子ども、${childWord(sex)}の${name}が生まれた。`, `${n === 1 ? 'A first child was born' : `Child number ${n} was born`}: a ${sex === 'F' ? 'daughter' : 'son'}, ${name}.`), 'family', n === 1 ? 5 : 2, n === 1, undefined, 'birth');
  bump(p, { happy: 8, bond: 8 });
  const motherAge = p.sex === 'F' ? p.age : p.spouse!.age;
  const risk = (c.mmr / 1e5) * (p.familyP < 0.3 && p.rural ? 1.6 : p.incomeP > 0.7 ? 0.5 : 1) * (motherAge < 18 ? 2 : 1);
  if (r() < risk) {
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
