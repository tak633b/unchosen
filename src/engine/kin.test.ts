import { describe, expect, it } from 'vitest';
import { createPerson, fromSaved, liveOut, toSaved, advanceYear } from './life';
import { allLives, lifeOf, type KinLife } from './kin';
import { contradictions } from './kin.testkit';
import { circle, people } from './bonds';
import type { Person, Relative, Tie } from './person';

const sample = (n: number, from = 1) => Array.from({ length: n }, (_, i) => {
  const s = from + i;
  return { seed: s * 104729 + 11, year: [1940, 1965, 1990, 2026, 2050][s % 5], country: [undefined, 'JPN', 'IND', 'NGA', 'BRA', 'USA'][s % 6] };
});

describe('輪の人の一生が、主人公の記録と食い違わない', () => {
  it('亡くなった主人公 (その後まで)', () => {
    const bad: string[] = [];
    for (const o of sample(150)) bad.push(...contradictions(liveOut(createPerson({ ...o, basis: 'births', auto: true }))));
    expect(bad.slice(0, 20)).toEqual([]);
  }, 120_000);
  it('生きている途中の主人公 (今わかっているところまで)', () => {
    const bad: string[] = [];
    for (const o of sample(60, 500)) {
      const p = createPerson({ ...o, basis: 'births', auto: true });
      while (p.alive && p.age < 45) advanceYear(p);
      if (!p.alive) continue;
      bad.push(...contradictions(p));
      expect(allLives(p).flatMap((l) => l.entries).some((e) => e.after)).toBe(false);
    }
    expect(bad.slice(0, 20)).toEqual([]);
  }, 120_000);
});

describe('輪の人の一生を作っても、主人公の人生は変わらない', () => {
  it('作る前後で、主人公の記録と乱数の状態が同じ', () => {
    for (const o of sample(20, 900)) {
      const p = liveOut(createPerson({ ...o, basis: 'births', auto: true }));
      const before = JSON.stringify(toSaved(p));
      allLives(p);
      expect(JSON.stringify(toSaved(p))).toBe(before);
    }
  });
  it('途中で一生を見てから進めても、見ずに進めたのと同じ人生', () => {
    for (const o of sample(20, 950)) {
      const a = createPerson({ ...o, basis: 'births', auto: true });
      const b = createPerson({ ...o, basis: 'births', auto: true });
      for (let i = 0; i < 30; i++) { advanceYear(a); advanceYear(b); if (i % 10 === 9) allLives(a); }
      liveOut(a);
      liveOut(b);
      expect(a.log).toEqual(b.log);
      expect(a.rng.state).toBe(b.rng.state);
    }
  });
});

describe('輪の人の一生は、seed とその人の id で決まる', () => {
  it('同じ記録からは同じ一生。保存して戻しても同じ', () => {
    const p = liveOut(createPerson({ seed: 4242, basis: 'births', auto: true, year: 1980 }));
    const q = fromSaved(JSON.parse(JSON.stringify(toSaved(p))));
    for (const t of people(p)) expect(lifeOf(q, t.id!)!.entries).toEqual(lifeOf(p, t.id!)!.entries);
  });
  it('出会った国を持たない古いセーブでも作れて、食い違わない', () => {
    const p = createPerson({ seed: 777, basis: 'births', auto: true, year: 1970 });
    while (p.alive && p.age < 50) advanceYear(p);
    const old = JSON.parse(JSON.stringify(toSaved(p)), (k, v) => (k === 'country' && typeof v === 'string' && v.length === 3 ? undefined : v));
    old.country = p.country;
    const q = fromSaved(old);
    expect(contradictions(q)).toEqual([]);
    expect(allLives(q).length).toBe(people(q).length);
  });
});

// 生きている途中で毎年見ても、もう過ぎた年の出来事はほとんど変わらない。
// 変わるのは、あとから記録に加わる事実 (友だちや子の結婚式) が前の年の恋愛を止めるときなど。
// 実測 (2026-10-09): この20人×20年で 3277 件中 10 件 (0.31%)。80人×30年では 20802 件中 99 件 (0.48%)
describe('途中で毎年見ても、過ぎた年はほとんど変わらない', () => {
  it('1年進めたあとも、その人の過去の出来事が同じ', () => {
    let seen = 0, changed = 0;
    for (let s = 1; s <= 20; s++) {
      const p = createPerson({ seed: s * 7717, basis: 'births', auto: true, year: [1960, 1990, 2020][s % 3] });
      while (p.alive && p.age < 20) advanceYear(p);
      for (let y = 0; y < 20 && p.alive; y++) {
        const now = p.birthYear + p.age;
        const past = (l: KinLife) => JSON.stringify(l.entries.filter((e) => !e.shared && e.year <= now).map((e) => e.text));
        const before = new Map(allLives(p).map((l) => [l.id, past(l)]));
        advanceYear(p);
        if (!p.alive) break;
        for (const l of allLives(p)) {
          if (!before.has(l.id)) continue;
          seen++;
          if (before.get(l.id) !== past(l)) changed++;
        }
      }
    }
    expect(seen).toBeGreaterThan(3000);
    expect(changed / seen).toBeLessThan(0.01);
  }, 60_000);
});

describe('主人公の記録の年齢と、きょうだいの誕生', () => {
  it('母が亡くなった後に、きょうだいが生まれない。孫の年齢は生まれてからの年数', () => {
    const bad: string[] = [];
    for (const o of sample(300, 2000)) {
      const p = liveOut(createPerson({ ...o, basis: 'births', auto: true }));
      const motherDied = p.mother.alive ? Infinity : p.mother.diedAt!;
      for (const s of p.siblings) {
        const bornPa = (s.alive ? p.age : s.diedAt!) - s.age;
        if (s.age >= 0 && bornPa > motherDied) bad.push(`seed ${p.seed} sibling ${s.name} born at pa ${bornPa}, mother died at pa ${motherDied}`);
      }
      for (const g of p.ties ?? []) if (g.role === 'grandchild' && g.alive && g.age !== p.age - g.since) bad.push(`seed ${p.seed} grandchild ${g.name} age ${g.age} != ${p.age - g.since}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  }, 60_000);
});

// 主人公の記録から写した一緒の出来事が、その人の一生で「自分と付き合い始めた」のように自分を相手にしない。
// その人の一生の中で、自分の名前のすぐ後に「と」が続く写しの行を数える (その人自身の出来事の語りは数えない)。
// 実測 (2026-10-09): 書き直す前は 300人の主人公の輪で 3544 行。書き直した後は、このテストの120人で 0 行
describe('一緒の出来事は、その人の側から書く', () => {
  it('写した行に、その人自身を相手にした文が無い', () => {
    const bad: string[] = [];
    for (const o of sample(120, 3000)) {
      const p = liveOut(createPerson({ ...o, basis: 'births', auto: true }));
      const byId = new Map(people(p).map((t) => [t.id!, t]));
      for (const l of allLives(p)) {
        const name = byId.get(l.id)!.name ?? '';
        for (const e of l.entries) if (e.shared && name && (e.text.includes(`${name}と`) || e.text.includes(`with ${name}`))) bad.push(`seed ${p.seed} #${l.id} ${e.text}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});

// 同じ1秒に生まれた人の輪を、遊んでいる途中に見るときは、主人公の今の年より先を出さない
describe('同じ1秒に生まれた人の輪の一生は、今の年まで', () => {
  it('その人が亡くなっていても、輪の人の一生は今の暦年で止まる', () => {
    let lives = 0;
    for (const o of sample(40, 4000)) {
      const other = createPerson({ ...o, basis: 'births', auto: true });
      while (other.alive && other.age < 30) advanceYear(other);
      while (other.alive) advanceYear(other); // 主人公より先に亡くなった人
      const upto = other.birthYear + Math.max(other.age, 30) + 5;
      for (const t of people(other)) {
        const l = lifeOf(other, t.id!, upto);
        if (!l) continue;
        lives++;
        expect(l.entries.every((e) => e.year <= upto), `${t.name}`).toBe(true);
        expect(l.born + l.age <= upto).toBe(true);
      }
    }
    expect(lives).toBeGreaterThan(200);
  }, 60_000);
});
