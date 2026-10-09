// 家族の時間: 親・きょうだい・連れ合い・子ども・ペットが歳をとり、時に亡くなる。
import { earnings, formatMoney } from '../economy';
import { bump, childWord, countryOf, log, type Person, type Relative } from '../person';
import { clamp, pick } from '../rng';
import { addTie, freshName, mourn, shared } from '../bonds';
import { makeName } from '../identity';
import { qAt } from './common';
import { pickCause } from '../causes';
import { isEn, L } from '../../i18n';
import { because, deathWhy } from '../why';
import { petAged, petDied } from '../pets';

export function relDies(p: Person, rel: Relative): string | null {
  const c = countryOf(p);
  if (p.rng() >= qAt(c, rel.sex, rel.age) || rel.fixed) return null; // 記録で決まっている人は、決まった年に亡くなる (kin.ts)
  rel.alive = false;
  rel.diedAt = p.age;
  return pickCause(p.rng, c, rel.sex, rel.age, qAt(c, rel.sex, rel.age), false);
}

export function family(p: Person): void {
  const r = p.rng;
  const parents = [[p.mother, '母', 'Mother'], [p.father, '父', 'Father']] as const;
  for (const [rel, word, wordEn] of parents) {
    if (!rel.alive) continue;
    rel.age++;
    const cause = relDies(p, rel);
    if (!cause) continue;
    const young = p.age < 18;
    log(p, L(`${word}が${rel.age}歳で亡くなった(${cause})。`, `${wordEn} died at ${rel.age} (${cause}).`), 'loss', true, undefined, [rel.id!]);
    because(p, deathWhy(countryOf(p), rel.sex, rel.age));
    mourn(p, rel, young ? -18 : -8, young ? -10 : -4);
    // まだ生まれていないきょうだいは、母が亡くなれば生まれない。父が亡くなった後は、その年のうちに生まれる子まで
    if (p.siblings.some((s) => s.age < 0)) p.siblings = p.siblings.filter((s) => s.age >= (rel === p.mother ? 0 : -1));
    if (young) p.familyP = clamp(p.familyP - 0.12, 0.01, 0.99);
    if (!p.mother.alive && !p.father.alive && p.age >= 18) inherit(p);
  }
  for (const s of p.siblings) {
    if (s.age < 0) {
      s.age++;
      if (s.age === 0) shared(p, [s], L(`${childWord(s.sex)}のきょうだい、${s.name}が生まれた。`, `A baby ${s.sex === 'F' ? 'sister' : 'brother'}, ${s.name}, was born.`), 'family', 0, false, undefined, 'sibling_born');
      continue;
    }
    if (!s.alive) continue;
    s.age++;
    if (relDies(p, s)) {
      log(p, isEn
        ? `${s.sex === 'F' ? 'Sister' : 'Brother'} ${s.name} died ${s.age <= 1 ? 'as a newborn' : `at ${s.age}`}.`
        : `${s.age <= 1 ? '生まれたばかりの' : `${s.age}歳の`}きょうだい、${s.name}が亡くなった。`, 'loss', true, undefined, [s.id!]);
      because(p, deathWhy(countryOf(p), s.sex, s.age));
      mourn(p, s, -10);
    }
  }
  if (p.spouse?.alive) {
    p.spouse.age++;
    const cause = relDies(p, p.spouse);
    if (cause) {
      log(p, L(`連れ合いの${p.spouse.name}が${p.spouse.age}歳で亡くなった(${cause})。`, `Spouse ${p.spouse.name} died at ${p.spouse.age} (${cause}).`), 'loss', true, undefined, [p.spouse.id!]);
      because(p, deathWhy(countryOf(p), p.spouse.sex, p.spouse.age));
      mourn(p, p.spouse, -20, -15);
    }
  }
  for (const k of p.children) {
    if (!k.alive) continue;
    k.age++;
    if (relDies(p, k)) {
      log(p, L(`子どもの${k.name}が${k.age <= 1 ? '1歳になる前に' : `${k.age}歳で`}亡くなった。`, `Child ${k.name} died ${k.age <= 1 ? 'before turning 1' : `at ${k.age}`}.`), 'loss', true, undefined, [k.id!]);
      because(p, deathWhy(countryOf(p), k.sex, k.age));
      mourn(p, k, -25, -5);
    }
    if (k.age === 18 && p.age < 80 && k.alive && !k.fixed) shared(p, [k], L(`${k.name}が家を出て、自分の暮らしを始めた。`, `${k.name} left home to start ${k.sex === 'F' ? 'her' : 'his'} own life.`), 'family', -2, false, undefined, 'left_home');
  }
  // 記録で決まっている子の子は記録どおりに足すので (kin.ts)、ここでは数えない
  const grown = p.children.filter((k) => k.alive && k.age >= 20 && !k.fixed);
  if (p.age >= 50 && grown.length && r() < 0.12) {
    const parent = pick(r, grown);
    const sex = r() < 0.512 ? 'M' : 'F';
    const name = freshName(() => makeName(r, p.country, sex), (p.nameKeys ??= [])).given;
    const g = addTie(p, { alive: true, age: 0, sex, name, role: 'grandchild', since: p.age, of: parent.id });
    shared(p, [g, parent], L(`孫が生まれた。${parent.name}の子で、名前は${g.name}。`, `A grandchild was born: ${parent.name}'s ${sex === 'F' ? 'daughter' : 'son'}, ${g.name}.`), 'family', 3, false, undefined, 'grandbirth');
    bump(p, { happy: 6, bond: 5 });
  }
  if (p.pet) {
    p.pet.age++;
    petAged(p);
    if (p.pet.age >= p.pet.life) {
      log(p, L(`${p.pet.kind}の${p.pet.name}が${p.pet.age}歳で死んだ。`, `${p.pet.name} the ${p.pet.kind === '犬' ? 'dog' : 'cat'} died at ${p.pet.age}.`), 'loss');
      petDied(p, p.log[p.log.length - 1].text);
      bump(p, { happy: -6 });
      p.pet = undefined;
    }
  }
}

// 両親を見送ったあと、家の財産をきょうだいと分ける
function inherit(p: Person): void {
  const c = countryOf(p);
  if (p.familyP < 0.45) return;
  const heirs = 1 + p.siblings.filter((s) => s.alive && s.age >= 0).length;
  // 中くらいの家で年収の2年分ほど、裕福な家ほど多い
  const amount = (earnings(c, p.familyP) * p.familyP ** 2 * 6) / heirs;
  p.wealth += amount;
  log(p, L(`両親の残した財産を${heirs > 1 ? 'きょうだいと分けて' : ''}受け継いだ(+${formatMoney(amount)})。`,
    `Inherited the parents' estate${heirs > 1 ? ', split with siblings' : ''} (+${formatMoney(amount)}).`), 'family');
}
