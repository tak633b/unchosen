// 恋愛・結婚・子ども。相手には名前と仕事がある。
import { makeName } from '../identity';
import { JOBS } from '../jobs';
import { bump, childWord, countryOf, decide, eduLevel, log, type Person, type Relative } from '../person';
import type { Sex } from '../lifetable';
import { clamp, normal, pick } from '../rng';
import { yearly } from './common';

const TRAITS = ['やさしい', '明るい', '物静かな', 'まじめな', 'よく笑う', '頼りになる', '気の強い', 'のんびりした'];

function newPartner(p: Person): Relative {
  const sex: Sex = p.sex === 'F' ? 'M' : 'F';
  const d = p.sex === 'F' ? normal(p.rng, 3, 3) : normal(p.rng, -3, 3);
  const age = Math.max(17, Math.round(p.age + d));
  const name = makeName(p.rng, p.country, sex).full;
  const edu = clamp(eduLevel(p) + Math.round(normal(p.rng, 0, 1)), 0, 5);
  const jobs = JOBS.filter((j) => j.edu <= edu && (j.maxEdu ?? 5) >= edu && !j.majors);
  return { alive: true, age, sex, name, job: jobs.length ? pick(p.rng, jobs).name : '家の仕事' };
}

function marry(p: Person, partner: Relative): void {
  p.spouse = { ...partner };
  p.dating = undefined;
  log(p, `${partner.name}と結婚した。`, 'love', true);
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
      log(p, `${p.dating.name}と別れた。`, 'love');
      bump(p, { happy: -6 });
      p.dating = undefined;
    } else if (p.dating.years >= 2 && r() < 0.35) {
      const d = p.dating;
      decide(p, {
        title: '結婚の話',
        text: `${d.name}と付き合って${d.years}年。そろそろ一緒になろうかと話している。`,
        options: [
          { label: '結婚する', apply: (q) => marry(q, d) },
          { label: 'このままでいい', apply: () => {} },
          { label: '別れる', apply: (q) => { log(q, `${d.name}と別れた。`, 'love'); q.dating = undefined; } },
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
    title: p.spouse ? 'もう一度' : '好きな人ができた',
    text: `知り合いの${partner.age}歳の${pick(r, TRAITS)}${partner.sex === 'F' ? '女性' : '男性'}、${partner.name}。仕事は${partner.job}。`,
    options: [
      { label: '結婚する', hint: 'つながり↑ 幸福↑', apply: (q) => marry(q, partner) },
      {
        label: '付き合う', hint: '決めるのは先送り',
        apply: (q) => { q.dating = { ...partner, years: 0 }; log(q, `${partner.name}と付き合い始めた。`, 'love'); bump(q, { happy: 6 }); },
      },
      { label: '断る', apply: () => {} },
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
  p.spouse = partner;
  p.childMarriage = true;
  const wasInSchool = p.school.enrolled;
  p.school.enrolled = false;
  log(p, `${p.age}歳で、親の決めた${partner.age}歳の${partner.name}と結婚させられた。${wasInSchool ? '学校には戻れなかった。' : ''}`, 'hard', true,
    `${c.name}では女性のおよそ${Math.round(c.childMarriage * 100)}%が18歳になる前に結婚している (UNICEF)`);
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
      title: '子ども',
      text: p.children.length ? 'もう一人、子どもを持つ？' : '子どもを持つ？',
      options: [
        { label: '持つ', apply: (q) => giveBirth(q) },
        { label: '今は持たない', apply: () => {} },
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
  const name = makeName(r, p.birthCountry, sex, { pool: p.pool, index: p.familyIndex }).given;
  p.children.push({ alive: true, age: 0, sex, name });
  const n = p.children.length;
  log(p, `${n}人目の子ども、${childWord(sex)}の${name}が生まれた。`, 'family', n === 1);
  bump(p, { happy: 8, bond: 8 });
  const motherAge = p.sex === 'F' ? p.age : p.spouse!.age;
  const risk = (c.mmr / 1e5) * (p.familyP < 0.3 && p.rural ? 1.6 : p.incomeP > 0.7 ? 0.5 : 1) * (motherAge < 18 ? 2 : 1);
  if (r() < risk) {
    if (p.sex === 'F') {
      p.alive = false;
      p.cause = '出産時の合併症';
    } else {
      p.spouse!.alive = false;
      log(p, `妻の${p.spouse!.name}が出産で亡くなった。`, 'loss', true,
        `${c.name}では出産10万件あたりおよそ${Math.round(c.mmr)}人の母親が亡くなる (WHO)`);
      bump(p, { happy: -25, bond: -15 });
    }
  }
}
